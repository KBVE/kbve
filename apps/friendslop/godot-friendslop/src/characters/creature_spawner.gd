extends Node3D

## Drops a group of creatures into the world and puts them in formation behind a
## leader, or leaves them roaming if there is nobody to follow.
##
## A stand-in for whatever grants a player an ally, so the rigs are in the world on
## Play rather than behind a debug flag. When there is a real party system this
## node is what it replaces; nothing else depends on it.

const CreatureRig := preload("res://src/characters/creature_rig.gd")
const CreaturePatrol := preload("res://src/characters/creature_patrol.gd")
const MECH_DIR := "res://assets/characters/creatures/mech/models/"

@export var mechs: Array[String] = ["George", "Leela", "Mike", "Stan"]
@export var terrain_path: NodePath
## Followed by everything spawned here. Empty leaves them roaming their spawn area
## instead, which is what a wild pack or a staged encounter wants.
@export var leader_path: NodePath
## A mech is over 7 units across, so anything under that spawns them intersecting.
@export var spacing := 13.0
@export var roam_radius := 20.0
@export var speed := 2.6
## Rank distance behind the leader, matched to the patrol's own default.
@export var formation_distance := 7.0
@export var formation_columns := 2
## Seconds between one-shot actions. Zero leaves them walking without attacking.
@export var action_interval := 7.0

const GROUP := &"creature_spawner"

var spawned: Array[Node3D] = []


func _ready() -> void:
	add_to_group(GROUP)
	# Deferred so the terrain they are dropped onto has finished generating.
	_spawn.call_deferred()


func _spawn() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain == null:
		terrain = get_tree().current_scene.get_node_or_null("Terrain")
	var leader := get_node_or_null(leader_path)
	var span := spacing * maxf(mechs.size() - 1.0, 0.0)
	for i in mechs.size():
		var name := mechs[i].strip_edges()
		var path := MECH_DIR + name + ".glb"
		if not ResourceLoader.exists(path):
			push_warning("creature_spawner: no creature '%s'" % name)
			continue
		var at := global_position + global_transform.basis.x * (spacing * i - span * 0.5)
		# Dropped straight onto its formation slot when there is a leader, so the
		# group does not open by sprinting past whoever it is meant to escort.
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
		add_child(patrol)
		if leader:
			patrol.leader_path = patrol.get_path_to(leader)
		# Physics owns the vertical now, so they are dropped just above the ground and
		# the first steps settle them, rather than planted inside the heightfield.
		if terrain and terrain.has_method("height_at"):
			at.y = terrain.height_at(at.x, at.z) + 1.0
		patrol.global_position = at

		# Parented to the patrol node so one transform carries the body and the
		# plate over its head together.
		var rig: Node3D = CreatureRig.new()
		rig.body = load(path)
		rig.display_name = name
		rig.snap_to_terrain = false
		patrol.add_child(rig)
		patrol.rig = rig
		spawned.append(patrol)
