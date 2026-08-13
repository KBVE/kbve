extends Node3D

## Slow orbit over the seeded world, for the title screen backdrop.

## Metres from the centre of the orbit.
@export var radius := 34.0
## A full circle in a little under three minutes — slow enough to read as drift rather
## than motion, which is the difference between a backdrop and a demo.
@export var degrees_per_second := 2.2
@export var height := 9.0
## How far below the rig the camera aims.
@export var look_down := 4.0
@export var start_degrees := 0.0

var _angle := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_angle = deg_to_rad(start_degrees)
	_apply()


func _process(delta: float) -> void:
	_angle = fposmod(_angle + deg_to_rad(degrees_per_second) * delta, TAU)
	_apply()


func _apply() -> void:
	var offset := Vector3(cos(_angle) * radius, height, sin(_angle) * radius)
	global_position = offset
	look_at(Vector3(0.0, height - look_down, 0.0))
