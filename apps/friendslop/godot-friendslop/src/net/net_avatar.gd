class_name NetAvatar
extends Node3D

## One player's body in a server-driven session — including our own.

## The extension interpolates the transform, so the frame delta is no longer a staircase.
## What is left to smooth is the correction at each snapshot boundary, which is small but
## lands on one frame.
const VELOCITY_SMOOTHING := 12.0
## Below this the blend space is idling anyway, and jitter in the last decimals of a
## resting position would otherwise read as a shuffle.
const REST_SPEED := 0.05

@onready var _rig: Node3D = $Mesh
@onready var _plate: Label3D = $Nameplate

var _velocity := Vector3.ZERO
var _last_position := Vector3.ZERO
var _has_last := false
var _is_local := false
## Where the player behind this body is looking. Only our own camera is ours to read —
## nobody else's aim is on the wire — so every other avatar turns to its travel alone.
var _aim: Node3D


func _ready() -> void:
	_last_position = global_position
	_has_last = true


## The name over the head.
func set_player_name(value: String) -> void:
	if _plate == null:
		return
	_plate.text = value
	_plate.visible = not value.is_empty() and not _is_local


## Our own avatar, and the camera whose yaw stands in for where we are looking.
func mark_local(aim: Node3D = null) -> void:
	_is_local = true
	_aim = aim
	if _plate:
		_plate.visible = false


func _process(delta: float) -> void:
	if delta <= 0.0:
		return
	var here := global_position
	if _has_last:
		var instant := (here - _last_position) / delta
		_velocity = _velocity.lerp(instant, clampf(VELOCITY_SMOOTHING * delta, 0.0, 1.0))
	_last_position = here
	_has_last = true

	if _rig == null or not _rig.has_method(&"drive"):
		return
	var travel := _velocity if Vector2(_velocity.x, _velocity.z).length() > REST_SPEED \
			else Vector3.ZERO
	_rig.drive(travel, _aim.global_rotation.y if _aim else _travel_aim(travel), false, delta)


## Aim to hand a body whose real one never reached us.
##
## Only the local player has an aim node; a remote one is a position stream, and the yaw
## its owner is looking along is client-to-server only -- it is not on `PlayerView`, so it
## never comes back down. Reporting the travel heading keeps such a body turning into its
## travel, which is what it did before facing could hold an aim at all. Feeding it its own
## facing instead would freeze it: the hold would compare travel against the very angle it
## is meant to change, and any turn past the strafe arc would never be taken.
func _travel_aim(travel: Vector3) -> float:
	if travel.is_zero_approx():
		return _rig.global_rotation.y
	return atan2(-travel.x, -travel.z)
