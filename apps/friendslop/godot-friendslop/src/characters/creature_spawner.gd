extends Node3D

## Drops a line of creatures around wherever this node sits and sets them walking.
##
## A stand-in for encounter placement, so the rigs are in the world on Play rather
## than behind a debug flag. When there is a real spawn system this node is what it
## replaces; nothing else depends on it.

const CreatureRig := preload("res://src/characters/creature_rig.gd")
const CreaturePatrol := preload("res://src/characters/creature_patrol.gd")
const MECH_DIR := "res://assets/characters/creatures/mech/models/"

@export var mechs: Array[String] = ["George", "Leela", "Mike", "Stan"]
@export var terrain_path: NodePath
## A mech is over 7 units across, so anything under that spawns them intersecting.
@export var spacing := 13.0
@export var roam_radius := 20.0
@export var speed := 2.6
## Seconds between one-shot actions. Zero leaves them walking without attacking.
@export var action_interval := 7.0

var spawned: Array[Node3D] = []


func _ready() -> void:
	# Deferred so the terrain they are dropped onto has finished generating.
	_spawn.call_deferred()


func _spawn() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain == null:
		terrain = get_tree().current_scene.get_node_or_null("Terrain")
	var span := spacing * maxf(mechs.size() - 1.0, 0.0)
	for i in mechs.size():
		var name := mechs[i].strip_edges()
		var path := MECH_DIR + name + ".glb"
		if not ResourceLoader.exists(path):
			push_warning("creature_spawner: no creature '%s'" % name)
			continue
		var at := global_position + global_transform.basis.x * (spacing * i - span * 0.5)

		var patrol: Node3D = CreaturePatrol.new()
		patrol.roam_radius = roam_radius
		patrol.speed = speed
		patrol.action_interval = action_interval
		add_child(patrol)
		patrol.global_position = at
		if terrain:
			patrol.terrain_path = patrol.get_path_to(terrain)

		# Parented to the patrol node so one transform carries the body and the
		# plate over its head together.
		var rig: Node3D = CreatureRig.new()
		rig.body = load(path)
		rig.display_name = name
		rig.snap_to_terrain = false
		patrol.add_child(rig)
		if terrain:
			rig.terrain_path = rig.get_path_to(terrain)
		patrol.rig = rig
		spawned.append(patrol)
