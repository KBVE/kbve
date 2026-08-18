class_name NetPet
extends Node3D


const CreatureRig := preload("res://src/characters/creature_rig.gd")
const MECH_DIR := "res://assets/characters/creatures/mech/models/"
const CHASSIS: Array[String] = ["George", "Leela", "Mike", "Stan"]

const VELOCITY_SMOOTHING := 12.0
const REPORTED_FLOOR := 0.01
const REST_SPEED := 0.05
const TURN_RATE := 8.0

var rig: Node3D

var _velocity := Vector3.ZERO
var _last_position := Vector3.ZERO
var _has_last := false
var _client: Node
var _body_id := 0


func bind_body(client: Node, body_id: int) -> void:
	_client = client
	_body_id = body_id


func _reported_velocity(here: Vector3, delta: float) -> Vector3:
	var drawn := (here - _last_position) / delta
	if _client == null or _body_id == 0:
		return drawn
	var told: Vector3 = _client.body_velocity(_body_id)
	if Vector2(told.x, told.z).length() > REPORTED_FLOOR:
		return told
	return drawn


func _ready() -> void:
	_last_position = global_position
	_has_last = true


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


func _process(delta: float) -> void:
	if rig == null or delta <= 0.0:
		return
	var here := global_position
	if _has_last:
		var instant := _reported_velocity(here, delta)
		_velocity = _velocity.lerp(instant, clampf(VELOCITY_SMOOTHING * delta, 0.0, 1.0))
	_last_position = here
	_has_last = true

	var speed := Vector2(_velocity.x, _velocity.z).length()
	rig.set_speed(speed)
	if speed > REST_SPEED:
		var heading := atan2(-_velocity.x, -_velocity.z)
		rig.rotation.y = lerp_angle(rig.rotation.y, heading, clampf(TURN_RATE * delta, 0.0, 1.0))
