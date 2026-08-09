extends Node3D

@export var count := 3
@export var player_path: NodePath

const RAVEN_MODEL := preload("res://assets/environment/props/fauna/raven/raven.glb")
const RAVEN_SCRIPT := preload("res://src/world/raven.gd")


func _ready() -> void:
	var player := get_node_or_null(player_path) as Node3D
	if not player:
		return
	for i in count:
		var raven := Node3D.new()
		raven.set_script(RAVEN_SCRIPT)
		raven.phase = TAU * float(i) / float(count)
		raven.orbit_radius = 5.0 + float(i) * 1.5
		raven.orbit_height = 4.0 + float(i) * 0.8
		raven.orbit_speed = 0.4 + float(i) * 0.12
		raven.add_child(RAVEN_MODEL.instantiate())
		add_child(raven)
		raven.target_path = raven.get_path_to(player)
		raven.global_position = player.global_position + Vector3(cos(raven.phase) * raven.orbit_radius, raven.orbit_height, sin(raven.phase) * raven.orbit_radius)
