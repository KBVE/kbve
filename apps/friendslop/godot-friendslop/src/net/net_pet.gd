class_name NetPet
extends Node3D

## One player's robot in a server-driven session, drawn from the pose the host
## publishes rather than steered here.

const CreatureRig := preload("res://src/characters/creature_rig.gd")
const MECH_DIR := "res://assets/characters/creatures/mech/models/"
## Chassis a `kind` selects. The server never interprets the number, so this is the
## only place it means anything.
const CHASSIS: Array[String] = ["George", "Leela", "Mike", "Stan"]

## The extension interpolates the transform, so what is left to smooth is the
## correction at each snapshot boundary: small, but landing on one frame.
const VELOCITY_SMOOTHING := 12.0
## Below this the walk cycle is idling anyway, and jitter in the last decimals of a
## resting position would read as a shuffle.
const REST_SPEED := 0.05
const TURN_RATE := 8.0

var rig: Node3D

var _velocity := Vector3.ZERO
var _last_position := Vector3.ZERO
var _has_last := false


func _ready() -> void:
	_last_position = global_position
	_has_last = true


## Builds the chassis. Called before the node is in the tree, because the rig
## resolves its own scene on `_ready` and that runs on `add_child`.
##
## Terrain snapping is off: the host owns the height, and snapping here would fight
## the pose it publishes against a ground that is not the same one.
func build(kind: int, display: String) -> void:
	if rig != null or kind < 0:
		return
	var index := kind if kind < CHASSIS.size() else 0
	var path := MECH_DIR + CHASSIS[index] + ".glb"
	if not ResourceLoader.exists(path):
		push_warning("net_pet: no chassis '%s'" % path)
		return
	var built: Node3D = CreatureRig.new()
	built.body = load(path)
	built.display_name = display
	built.snap_to_terrain = false
	add_child(built)
	rig = built


func set_display_name(value: String) -> void:
	if rig and rig.has_method(&"set_display_name"):
		rig.set_display_name(value)


## Drives the walk cycle and the facing from how the body actually moved, because
## neither is on the wire: the character proxy never turns, so its pose says
## nothing about which way the thing is looking.
##
## The rig is turned rather than this node, which the extension overwrites from the
## snapshot every frame.
func _process(delta: float) -> void:
	if rig == null or delta <= 0.0:
		return
	var here := global_position
	if _has_last:
		var instant := (here - _last_position) / delta
		_velocity = _velocity.lerp(instant, clampf(VELOCITY_SMOOTHING * delta, 0.0, 1.0))
	_last_position = here
	_has_last = true

	var speed := Vector2(_velocity.x, _velocity.z).length()
	rig.set_speed(speed)
	if speed > REST_SPEED:
		var heading := atan2(-_velocity.x, -_velocity.z)
		rig.rotation.y = lerp_angle(rig.rotation.y, heading, clampf(TURN_RATE * delta, 0.0, 1.0))
