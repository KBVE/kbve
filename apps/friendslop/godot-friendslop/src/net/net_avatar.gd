class_name NetAvatar
extends Node3D

## One player's body in a server-driven session — including our own.

## Snapshots land at the network rate, so the raw delta is a staircase — three rendered
## frames of nothing, then one jump.
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


func _ready() -> void:
	_last_position = global_position
	_has_last = true


## The name over the head.
func set_player_name(value: String) -> void:
	if _plate == null:
		return
	_plate.text = value
	_plate.visible = not value.is_empty() and not _is_local


## Our own avatar.
func mark_local() -> void:
	_is_local = true
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

	if _rig == null or not _rig.has_method(&"set_locomotion"):
		return
	var speed := Vector2(_velocity.x, _velocity.z).length()
	var local := Vector3.ZERO
	if speed > REST_SPEED:
		var heading := atan2(_velocity.x, _velocity.z)
		rotation.y = lerp_angle(rotation.y, heading, clampf(10.0 * delta, 0.0, 1.0))
		local = global_transform.basis.inverse() * _velocity
	_rig.set_locomotion(local, false, delta)
