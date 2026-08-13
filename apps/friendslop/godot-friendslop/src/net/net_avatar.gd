class_name NetAvatar
extends Node3D

## One player's body in a server-driven session — including our own.
##
## Nothing here decides where the avatar is: the extension writes this node's
## transform straight from the snapshot. What is left is presentation, and the
## one thing presentation still has to work out for itself is how fast the body
## is moving, because the snapshot carries a pose and the animation blend space
## wants a velocity.
##
## Deriving it from the position delta rather than reading a replicated velocity
## is deliberate. The wire already costs ~42 bytes a body and snapshots arrive
## at 20 Hz against a 60 Hz sim, so a replicated velocity would be a third field
## per body that is stale on two frames out of three anyway — while the delta is
## exactly the motion that was actually rendered.

## Snapshots land at the network rate, so the raw delta is a staircase — three
## rendered frames of nothing, then one jump. Smoothed hard enough to walk, not
## so hard that stopping takes a stride to register.
const VELOCITY_SMOOTHING := 12.0
## Below this the blend space is idling anyway, and jitter in the last decimals
## of a resting position would otherwise read as a shuffle.
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


## The name over the head. Empty hides the plate rather than drawing an empty
## box — a body with no roster entry yet is a normal state for the frame or two
## between a snapshot and the roster that explains it.
func set_player_name(value: String) -> void:
	if _plate == null:
		return
	_plate.text = value
	_plate.visible = not value.is_empty() and not _is_local


## Our own avatar. The camera sits on it, so its nameplate would be a label
## across the middle of the screen.
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
		# Face the way we are moving. The server sends no facing — it simulates a
		# capsule, which has none — so heading is the renderer's to choose, and
		# the direction of travel is the only honest answer.
		var heading := atan2(_velocity.x, _velocity.z)
		rotation.y = lerp_angle(rotation.y, heading, clampf(10.0 * delta, 0.0, 1.0))
		local = global_transform.basis.inverse() * _velocity
	_rig.set_locomotion(local, false, delta)
