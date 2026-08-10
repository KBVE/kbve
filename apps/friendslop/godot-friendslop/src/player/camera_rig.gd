extends Camera3D

@export var arm_length := 4.0
@export var margin := 0.3
@export var min_length := 0.6
@export var return_speed := 5.0
@export var evade_speed := 3.5
@export var evade_ratio := 0.55
@export var ground_clearance := 0.35

const YAW_PROBES: Array[float] = [0.0, 0.28, -0.28, 0.55, -0.55]

@onready var _pivot: Node3D = get_parent()
@onready var _player: PhysicsBody3D = _pivot.get_parent()

var _terrain: Node
var _len := 4.0
var _yaw := 0.0


func _ready() -> void:
	_len = arm_length
	_terrain = get_tree().current_scene.get_node_or_null("Terrain")
	_apply()


func _physics_process(delta: float) -> void:
	var space := get_world_3d().direct_space_state
	var origin := _pivot.global_position
	var exclude: Array[RID] = [_player.get_rid()]
	var lens: Array[float] = []
	for y in YAW_PROBES:
		var local_dir := Vector3(sin(y), 0.0, cos(y))
		var dir := (_pivot.global_transform.basis * local_dir).normalized()
		var q := PhysicsRayQueryParameters3D.create(origin, origin + dir * arm_length)
		q.exclude = exclude
		var hit := space.intersect_ray(q)
		if hit.is_empty():
			lens.append(arm_length)
		else:
			lens.append(maxf(origin.distance_to(hit.position) - margin, min_length))

	var target_yaw := YAW_PROBES[0]
	var target_len: float = lens[0]
	if lens[0] < arm_length * evade_ratio:
		var best_i := 0
		for i in YAW_PROBES.size():
			if lens[i] > lens[best_i] + 0.2:
				best_i = i
		target_yaw = YAW_PROBES[best_i]
		target_len = lens[best_i]

	_yaw = lerp_angle(_yaw, target_yaw, 1.0 - exp(-evade_speed * delta))
	if target_len < _len:
		_len = target_len
	else:
		_len = lerpf(_len, target_len, 1.0 - exp(-return_speed * delta))
	_apply()


func _apply() -> void:
	position = Vector3(sin(_yaw), 0.0, cos(_yaw)) * _len
	rotation = Vector3(0.0, _yaw, 0.0)
	if _terrain and _terrain.has_method("height_at"):
		var gp := global_position
		var floor_y: float = _terrain.height_at(gp.x, gp.z) + ground_clearance
		if gp.y < floor_y:
			global_position.y = floor_y
