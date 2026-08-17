extends Node3D


const CreatureRig := preload("res://src/characters/creature_rig.gd")
const CreaturePatrol := preload("res://src/characters/creature_patrol.gd")
const MECH_DIR := "res://assets/characters/creatures/mech/models/"

@export var mechs: Array[String] = ["George", "Leela", "Mike", "Stan"]
@export var terrain_path: NodePath
@export var leader_path: NodePath
@export var spacing := 13.0
@export var preset := &"mech"
@export var action_interval := 7.0

@export var field_cell := 2.0
@export var field_max_slope := 1.1
@export var field_clearance := 2.5
@export var field_slack := 6.0

@export_group("Field obstacles")
@export var tree_field_path: NodePath
@export var stone_field_path: NodePath
@export var tree_block_ratio := 0.45
@export var tree_cost := 160.0
@export var stone_block_ratio := 0.2
@export var stone_cost := 220.0
@export var bridge_cost := 40
@export var deck_drop := 1.5
@export var field_debug := false

const GROUP := &"creature_spawner"

var spawned: Array[Node3D] = []
var field: QFlowField
var _leader: Node3D
var _terrain: Node
var _scatter_tries := 20
var _scatter_wait := 0.0
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
		if terrain is Node:
			rig.terrain_path = (terrain as Node).get_path()
		patrol.add_child(rig)
		patrol.rig = rig
		spawned.append(patrol)


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

	var bridge := _bridge_plan(terrain)
	if not bridge.is_empty():
		field.block_path(bridge["from"], bridge["to"], bridge["solid_half_width"])

	field.inflate(field_clearance)
	if not bridge.is_empty():
		var mouth: Vector3 = (bridge["to"] - bridge["from"]).normalized() \
				* (field_clearance + field_cell)
		field.open_path(bridge["from"] - mouth, bridge["to"] + mouth,
				bridge["walk_half_width"], bridge_cost)
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


func _bridge_plan(terrain: Node) -> Dictionary:
	if terrain == null or not terrain.has_method("bridge_plan"):
		return {}
	return terrain.bridge_plan()


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
	if field and _leader:
		field.rebuild_if_moved(_leader.global_position, field_slack)
