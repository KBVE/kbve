class_name NetAvatar
extends Node3D


const VELOCITY_SMOOTHING := 12.0
const REPORTED_FLOOR := 0.01
const REST_SPEED := 0.05
const COYOTE_TIME := 0.12

@onready var _rig: Node3D = $Mesh
@onready var _plate: Label3D = $Nameplate

var _velocity := Vector3.ZERO
var _last_position := Vector3.ZERO
var _has_last := false
var _is_local := false
var _aim: Node3D
var _client: Node
var _body_id := 0
var _wish := Vector2.ZERO
var _jump := false
var _yaw := 0.0
var _planned := Vector3.ZERO
var _airborne_t := 0.0
var _leaping := false


func bind_body(client: Node, body_id: int) -> void:
	_client = client
	_body_id = body_id


func _ready() -> void:
	_last_position = global_position
	_has_last = true


func set_player_name(value: String) -> void:
	if _plate == null:
		return
	_plate.text = value
	_plate.visible = not value.is_empty() and not _is_local


func mark_local(aim: Node3D = null) -> void:
	_is_local = true
	_aim = aim
	if _plate:
		_plate.visible = false


func push_intent(wish: Vector2, jump: bool, yaw: float) -> void:
	_wish = wish
	_jump = jump
	_yaw = yaw


func _process(delta: float) -> void:
	if delta <= 0.0:
		return
	var here := global_position
	var prev := _last_position if _has_last else here
	_last_position = here
	_has_last = true
	if _rig == null or not _rig.has_method(&"drive"):
		return
	var grounded := true
	if _client != null and _body_id != 0:
		grounded = _client.body_grounded(_body_id)
	if _is_local:
		_drive_predicted(grounded, delta)
		return
	var instant := _reported_velocity(prev, here, delta)
	_velocity = _velocity.lerp(instant, clampf(VELOCITY_SMOOTHING * delta, 0.0, 1.0))
	var travel := _velocity if Vector2(_velocity.x, _velocity.z).length() > REST_SPEED \
			else Vector3.ZERO
	_rig.drive(travel, _travel_aim(travel), not grounded, delta)


func _drive_predicted(grounded: bool, delta: float) -> void:
	var yaw := _aim.global_rotation.y if _aim else _yaw
	var footed := grounded and not _leaping
	if footed and _planned.y < 0.0:
		_planned.y = 0.0
	_planned = _rig.step_motion(_wish, _jump, false, false, false,
			_planned, yaw, footed, _gravity(), delta)
	if _rig.jumped():
		_leaping = true
	elif _leaping and grounded and _planned.y <= 0.0:
		_leaping = false
	_airborne_t = 0.0 if grounded else _airborne_t + delta
	_rig.drive(_planned, yaw, _leaping or _airborne_t > COYOTE_TIME, delta)


func _gravity() -> float:
	return -float(ProjectSettings.get_setting("physics/3d/default_gravity", 9.8))


func _reported_velocity(prev: Vector3, here: Vector3, delta: float) -> Vector3:
	var drawn := (here - prev) / delta
	if _client == null or _body_id == 0:
		return drawn
	var told: Vector3 = _client.body_velocity(_body_id)
	if Vector2(told.x, told.z).length() > REPORTED_FLOOR:
		return told
	return drawn


func _travel_aim(travel: Vector3) -> float:
	if travel.is_zero_approx():
		return _rig.global_rotation.y
	return atan2(-travel.x, -travel.z)
