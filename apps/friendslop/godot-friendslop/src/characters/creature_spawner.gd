extends Node3D

## Drops a group of creatures into the world and puts them in formation behind a leader,
## or leaves them roaming if there is nobody to follow.

const CreatureRig := preload("res://src/characters/creature_rig.gd")
const CreaturePatrol := preload("res://src/characters/creature_patrol.gd")
const MECH_DIR := "res://assets/characters/creatures/mech/models/"

@export var mechs: Array[String] = ["George", "Leela", "Mike", "Stan"]
@export var terrain_path: NodePath
## Followed by everything spawned here.
@export var leader_path: NodePath
## Where they are put down, which is placement rather than steering: a mech is over
## 7 units across, so anything under that spawns them intersecting. How they hold a
## rank once they are walking comes from the preset.
@export var spacing := 13.0
## Named tuning for everything spawned here, resolved in Rust.
@export var preset := &"mech"
## Seconds between one-shot actions.
@export var action_interval := 7.0

## Size of a flow field cell. The whole grid is integrated at once, so this is
## the number that decides both precision and cost: 4.0 rebuilds in 0.5ms and
## cannot represent a 3.5 wide bridge deck at all, 2.0 takes 2.4ms and can.
## Rebuilds only happen when the leader has moved `field_slack`, so 2.4ms lands
## about once a second. Worth raising again on a phone.
@export var field_cell := 2.0
## Ground steeper than this is not walkable, as a height change per unit across.
@export var field_max_slope := 1.1
## Obstacles grow by this so the routes fit a mech rather than a point.
@export var field_clearance := 2.5
## The leader has to move this far before the field is integrated again. A full
## rebuild is far too slow to run every frame.
@export var field_slack := 6.0

@export_group("Field obstacles")
## Where the trees and rocks come from. Left empty, they are looked up by name
## in the current scene, which is how the world scene has them.
@export var tree_field_path: NodePath
@export var stone_field_path: NodePath
## Cell density at which trunks stop being a cost and become a wall. A single
## trunk fills a few percent of a cell, so this only trips in real woodland.
@export var tree_block_ratio := 0.45
## Cost a fully covered cell of trunks would carry. Sparse woods stay walkable
## but lose to open ground, which is what keeps routes on the paths.
@export var tree_cost := 160.0
## Rocks are wide enough to stop a mech, so they close ground far sooner.
@export var stone_block_ratio := 0.2
@export var stone_cost := 220.0
## The crossing is narrow and has a drop either side, so it is opened but not
## made attractive: a route only takes it when there is no way round.
@export var bridge_cost := 40
## How far under the deck still counts as being on it. Covers the walkway's own
## thickness and a body's sag; anything lower is under the bridge, not on it.
@export var deck_drop := 1.5
## Prints what the built field closed. A field that walled off the whole map
## routes nothing and looks exactly like one that was never built at all.
@export var field_debug := false

const GROUP := &"creature_spawner"

var spawned: Array[Node3D] = []
var field: QFlowField
var _leader: Node3D
var _terrain: Node
## Scatter arrives a frame or more after this spawner runs, so the first field
## is built without it and rebuilt once it lands.
var _scatter_tries := 20
var _scatter_wait := 0.0
## The world is generated off-thread and this spawner defers itself by a single
## frame, so the first _build_field runs while height_grid() is still empty and
## returns at its guard. Retried until the terrain actually has heights: without
## this the field only ever appears if scatter happens to land first, and a
## creature that needs a route around the river never gets one.
var _field_tries := 60


func _ready() -> void:
	add_to_group(GROUP)
	_spawn.call_deferred()


func _spawn() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain == null:
		terrain = get_tree().current_scene.get_node_or_null("Terrain")
	var leader := get_node_or_null(leader_path)
	_leader = leader as Node3D
	_terrain = terrain
	_build_field(terrain)
	var rank: Dictionary = QPatrol.preset_info(preset)
	var span := spacing * maxf(mechs.size() - 1.0, 0.0)
	for i in mechs.size():
		var name := mechs[i].strip_edges()
		var path := MECH_DIR + name + ".glb"
		if not ResourceLoader.exists(path):
			push_warning("creature_spawner: no creature '%s'" % name)
			continue
		var at := global_position + global_transform.basis.x * (spacing * i - span * 0.5)
		if leader is Node3D:
			var lead := (leader as Node3D).global_transform
			var back := Vector3(lead.basis.z.x, 0.0, lead.basis.z.z).normalized()
			var side := Vector3(lead.basis.x.x, 0.0, lead.basis.x.z).normalized()
			var columns := maxi(int(rank.get("formation_columns", 2)), 1)
			var row := i / columns
			var col := i % columns
			var in_row := mini(columns, mechs.size() - row * columns)
			at = lead.origin \
					+ back * (float(rank.get("formation_distance", 7.0)) \
						+ row * float(rank.get("rank_depth", 9.0))) \
					+ side * (spacing * (col - (in_row - 1) * 0.5))

		var patrol: Node3D = CreaturePatrol.new()
		patrol.action_interval = action_interval
		patrol.formation_slot = i
		patrol.formation_count = mechs.size()
		patrol.preset = preset
		patrol.seed = i
		add_child(patrol)
		if leader:
			patrol.leader_path = patrol.get_path_to(leader)
		if terrain and terrain.has_method("height_at"):
			at.y = terrain.height_at(at.x, at.z) + 1.0
		patrol.global_position = at

		var rig: Node3D = CreatureRig.new()
		rig.body = load(path)
		rig.display_name = name
		rig.snap_to_terrain = false
		## Absolute, because the rig resolves it from _ready, which runs on add_child
		## before it is anywhere the terrain can be reached relatively.
		if terrain is Node:
			rig.terrain_path = (terrain as Node).get_path()
		patrol.add_child(rig)
		patrol.rig = rig
		spawned.append(patrol)


## One field, shared by everything following the leader. Water and cliffs come
## out of the terrain the ground is drawn from, and the trees and rocks off the
## same fields that grew them, so a route never crosses anything a body would.
func _build_field(terrain: Node) -> void:
	if terrain == null or not terrain.has_method("height_grid"):
		return
	var heights: PackedFloat32Array = terrain.height_grid()
	var res: int = terrain.height_grid_res()
	if heights.is_empty() or res <= 1:
		return
	var extent: float = terrain.extent
	field = QFlowField.create(extent, field_cell)
	field.stamp_terrain(heights, res, extent, terrain.water_level, field_max_slope)

	var trees := _obstacle_discs(tree_field_path, "TreeField")
	if not trees.is_empty():
		field.stamp_obstacles(trees, tree_block_ratio, tree_cost)
	var stones := _obstacle_discs(stone_field_path, "StoneField")
	if not stones.is_empty():
		field.stamp_obstacles(stones, stone_block_ratio, stone_cost)

	# The crossing is a causeway with one walkable line along the top: mostly
	# wall. Closing it before the clearance is what makes the routes go round the
	# abutments and the railed approaches instead of into the side of them.
	var bridge := _bridge_plan(terrain)
	if not bridge.is_empty():
		field.block_path(bridge["from"], bridge["to"], bridge["solid_half_width"])

	field.inflate(field_clearance)
	# After the clearance, never before. The ground under the deck is water and
	# the structure itself is now closed, so the crossing has been shut twice
	# over; this is what cuts it back open.
	if not bridge.is_empty():
		# Opened past both ends, not just end to end. The clearance was grown off
		# the structure in every direction, including beyond its ends, so a walkway
		# reopened to exactly the length that was closed is a sealed tube nothing
		# can get into -- which strands everything on the far bank.
		var mouth: Vector3 = (bridge["to"] - bridge["from"]).normalized() \
				* (field_clearance + field_cell)
		field.open_path(bridge["from"] - mouth, bridge["to"] + mouth,
				bridge["walk_half_width"], bridge_cost)
		# The grid is flat, so the deck and the riverbed under it are one cell.
		# Without this a creature that ends up beneath the span is told it is on
		# a perfectly good route and walks into a pier until something moves it.
		field.set_deck(bridge["deck_from"], bridge["deck_to"],
				bridge["walk_half_width"] + field_clearance, bridge["deck_y"], deck_drop)

	if _leader:
		field.build(_leader.global_position)
	if field_debug:
		var s: Dictionary = field.stats()
		print("creature_spawner: field %d cells, %d blocked, %d reachable; %d trees, %d rocks" % [
			s.get("cells", 0), s.get("blocked", 0), s.get("reachable", 0),
			trees.size() / 3, stones.size() / 3,
		])
		print("creature_spawner: bridge %s" % [bridge])


## The crossing as something with sides, if the terrain built one. Empty means
## this world has no river to cross.
func _bridge_plan(terrain: Node) -> Dictionary:
	if terrain == null or not terrain.has_method("bridge_plan"):
		return {}
	return terrain.bridge_plan()


## Scatter is grown on the GPU and read back, so it may not exist yet on the
## frame this spawner runs. An empty answer means "not yet", not "none".
func _obstacle_discs(path: NodePath, fallback: String) -> PackedFloat32Array:
	var node := get_node_or_null(path)
	if node == null:
		node = get_tree().current_scene.get_node_or_null(NodePath(fallback))
	if node == null or not node.has_method("obstacle_discs"):
		return PackedFloat32Array()
	return node.obstacle_discs()


func _physics_process(delta: float) -> void:
	if field == null and _field_tries > 0:
		_scatter_wait -= delta
		if _scatter_wait <= 0.0:
			_scatter_wait = 0.5
			_field_tries -= 1
			_build_field(_terrain)
			if field != null and field_debug:
				print("creature_spawner: field built once the terrain was ready")
	elif _scatter_tries > 0:
		_scatter_wait -= delta
		if _scatter_wait <= 0.0:
			_scatter_wait = 0.5
			_scatter_tries -= 1
			if not _obstacle_discs(tree_field_path, "TreeField").is_empty() \
					or not _obstacle_discs(stone_field_path, "StoneField").is_empty():
				_scatter_tries = 0
				_build_field(_terrain)
	# Rebuilt here rather than by each creature, so the cost is paid once no
	# matter how many are following it.
	if field and _leader:
		field.rebuild_if_moved(_leader.global_position, field_slack)
