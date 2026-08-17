class_name NetAvatar
extends Node3D


const VELOCITY_SMOOTHING := 12.0
const REPORTED_FLOOR := 0.01
const REST_SPEED := 0.05

@onready var _rig: Node3D = $Mesh
@onready var _plate: Label3D = $Nameplate

var _velocity := Vector3.ZERO
var _last_position := Vector3.ZERO
var _has_last := false
var _is_local := false
var _aim: Node3D
var _client: Node
var _body_id := 0


## Points this avatar at the body the host publishes for it.
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


func _process(delta: float) -> void:
	if delta <= 0.0:
		return
	var here := global_position
	if _has_last:
		var instant := _reported_velocity(here, delta)
		_velocity = _velocity.lerp(instant, clampf(VELOCITY_SMOOTHING * delta, 0.0, 1.0))
	_last_position = here
	_has_last = true

	if _rig == null or not _rig.has_method(&"drive"):
		return
	var travel := _velocity if Vector2(_velocity.x, _velocity.z).length() > REST_SPEED \
			else Vector3.ZERO
	_rig.drive(travel, _aim.global_rotation.y if _aim else _travel_aim(travel), false, delta)


## Velocity the host published, falling back to the drawn motion when it has not said.
func _reported_velocity(here: Vector3, delta: float) -> Vector3:
	var drawn := (here - _last_position) / delta
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
