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
## A mech is over 7 units across, so anything under that spawns them intersecting.
@export var spacing := 13.0
@export var roam_radius := 20.0
@export var speed := 2.6
## Rank distance behind the leader, matched to the patrol's own default.
@export var formation_distance := 7.0
@export var formation_columns := 2
## Seconds between one-shot actions.
@export var action_interval := 7.0

## Size of a flow field cell. Smaller routes more precisely and costs more to
## integrate; the whole grid is rebuilt at once.
@export var field_cell := 4.0
## Ground steeper than this is not walkable, as a height change per unit across.
@export var field_max_slope := 1.1
## Obstacles grow by this so the routes fit a mech rather than a point.
@export var field_clearance := 2.5
## The leader has to move this far before the field is integrated again. A full
## rebuild is far too slow to run every frame.
@export var field_slack := 6.0

const GROUP := &"creature_spawner"

var spawned: Array[Node3D] = []
var field: QFlowField
var _leader: Node3D


func _ready() -> void:
	add_to_group(GROUP)
	_spawn.call_deferred()


func _spawn() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain == null:
		terrain = get_tree().current_scene.get_node_or_null("Terrain")
	var leader := get_node_or_null(leader_path)
	_leader = leader as Node3D
	_build_field(terrain)
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
			var columns := maxi(formation_columns, 1)
			var row := i / columns
			var col := i % columns
			var in_row := mini(columns, mechs.size() - row * columns)
			at = lead.origin + back * (formation_distance + row * 9.0) \
					+ side * (spacing * (col - (in_row - 1) * 0.5))

		var patrol: Node3D = CreaturePatrol.new()
		patrol.roam_radius = roam_radius
		patrol.speed = speed
		patrol.action_interval = action_interval
		patrol.formation_slot = i
		patrol.formation_count = mechs.size()
		patrol.formation_distance = formation_distance
		patrol.formation_spacing = spacing
		patrol.formation_columns = formation_columns
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
		patrol.add_child(rig)
		patrol.rig = rig
		spawned.append(patrol)


## One field, shared by everything following the leader. Water and cliffs come
## out of the terrain the ground is drawn from, so a route never crosses either.
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
	field.inflate(field_clearance)
	if _leader:
		field.build(_leader.global_position)


func _physics_process(_delta: float) -> void:
	# Rebuilt here rather than by each creature, so the cost is paid once no
	# matter how many are following it.
	if field and _leader:
		field.rebuild_if_moved(_leader.global_position, field_slack)
