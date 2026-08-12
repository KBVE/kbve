extends Camera3D

@export var arm_length := 4.0
@export var margin := 0.3
@export var min_length := 0.6
@export var return_speed := 5.0
@export var evade_speed := 3.5
@export var evade_ratio := 0.55
@export var ground_clearance := 0.35
@export var shoulder_side := 0.6
@export var shoulder_length := 2.2
@export var first_person_forward := 0.12

const YAW_PROBES: Array[float] = [0.0, 0.28, -0.28, 0.55, -0.55]
const STRAIGHT_PROBE: Array[float] = [0.0]

@onready var _pivot: Node3D = get_parent()
@onready var _player: PhysicsBody3D = _pivot.get_parent()

var _terrain: Node
var _settings: Node
var _body: Node3D
var _mode := 1
var _len := 4.0
var _yaw := 0.0
var _side := 0.0


func _ready() -> void:
	_len = arm_length
	var scene := get_tree().current_scene
	_terrain = scene.get_node_or_null("Terrain")
	_settings = scene.get_node_or_null("GameplaySettings")
	_body = _player.get_node_or_null("Mesh") as Node3D
	if _settings:
		_settings.changed.connect(_read_settings)
		_read_settings()
	_apply()


func _read_settings() -> void:
	_mode = int(_settings.camera_mode)
	if _body:
		_body.visible = _mode != 0
	if _mode == 0:
		_len = 0.0
		_yaw = 0.0
		_side = 0.0
	_apply()


func _target_arm() -> float:
	return shoulder_length if _mode == 2 else arm_length


func _physics_process(delta: float) -> void:
	if _mode == 0:
		return

	var arm := _target_arm()
	_side = lerpf(_side, shoulder_side if _mode == 2 else 0.0, 1.0 - exp(-return_speed * delta))

	var pivot_basis := _pivot.global_transform.basis
	var origin := _pivot.global_position + pivot_basis.x * _side
	var space := get_world_3d().direct_space_state
	var exclude: Array[RID] = [_player.get_rid()]
	var probes := YAW_PROBES if _mode == 1 else STRAIGHT_PROBE
	var lens: Array[float] = []
	for y in probes:
		var local_dir := Vector3(sin(y), 0.0, cos(y))
		var dir := (pivot_basis * local_dir).normalized()
		var q := PhysicsRayQueryParameters3D.create(origin, origin + dir * arm)
		q.exclude = exclude
		var hit := space.intersect_ray(q)
		if hit.is_empty():
			lens.append(arm)
		else:
			lens.append(maxf(origin.distance_to(hit.position) - margin, min_length))

	var target_yaw: float = probes[0]
	var target_len: float = lens[0]
	if _mode == 1 and lens[0] < arm * evade_ratio:
		var best_i := 0
		for i in probes.size():
			if lens[i] > lens[best_i] + 0.2:
				best_i = i
		target_yaw = probes[best_i]
		target_len = lens[best_i]

	_yaw = lerp_angle(_yaw, target_yaw, 1.0 - exp(-evade_speed * delta))
	if target_len < _len:
		_len = target_len
	else:
		_len = lerpf(_len, target_len, 1.0 - exp(-return_speed * delta))
	_apply()


func _apply() -> void:
	if _mode == 0:
		position = Vector3(0.0, 0.0, -first_person_forward)
		rotation = Vector3.ZERO
		return
	position = Vector3(_side, 0.0, 0.0) + Vector3(sin(_yaw), 0.0, cos(_yaw)) * _len
	rotation = Vector3(0.0, _yaw, 0.0)
	if _terrain and _terrain.has_method("height_at"):
		var gp := global_position
		var floor_y: float = _terrain.height_at(gp.x, gp.z) + ground_clearance
		if gp.y < floor_y:
			global_position.y = floor_y
