extends Node3D

@export var target_path: NodePath
@export var orbit_radius := 6.0
@export var orbit_height := 4.5
@export var orbit_speed := 0.5
@export var phase := 0.0
@export var follow_speed := 2.5
@export var flap_speed := 9.0
@export var flap_amount := 0.9
@export var flap_axis := Vector3(1.0, 0.0, 0.0)
@export var model_yaw_fix := 0.0
@export var glide_blend := 0.35
@export var body_pitch_amount := 0.06
@export var tail_amount := 0.12
@export var leg_tuck := 2.0
@export var twist_amount := 0.18
@export var turn_flap_asymmetry := 0.35
@export var swoop_depth := 2.2

var _skeleton: Skeleton3D
var _bones := {}
var _rests := {}
var _time := 0.0
var _flap_energy := 1.0
var _wing_phase := 0.0
var _orbit_angle := 0.0
var _prev_yaw := 0.0
var _turn := 0.0

const CHAIN := {
	"Wing.L": [1.0, 0.0], "Wing.R": [1.0, 0.0],
	"Wing.001.L": [0.6, -0.45], "Wing.001.R": [0.6, -0.45],
	"Wing.002.L": [0.45, -0.9], "Wing.002.R": [0.45, -0.9],
}


func _ready() -> void:
	_skeleton = _find_skeleton(self)
	if _skeleton:
		for bone_name in CHAIN.keys() + ["spine", "spine.001", "neck.001", "neck.002", "t_feather.L", "t_feather.R", "thigh.L", "thigh.R"]:
			var idx := _skeleton.find_bone(bone_name)
			if idx >= 0:
				_bones[bone_name] = idx
				_rests[bone_name] = _skeleton.get_bone_pose_rotation(idx)
	_time = phase
	_wing_phase = phase
	_orbit_angle = phase
	_prev_yaw = rotation.y


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found:
			return found
	return null


func _pose(bone_name: String, angle: float, axis: Vector3 = Vector3(1.0, 0.0, 0.0)) -> void:
	if _bones.has(bone_name):
		_skeleton.set_bone_pose_rotation(_bones[bone_name], _rests[bone_name] * Quaternion(axis.normalized(), angle))


func _pose2(bone_name: String, pitch: float, twist: float) -> void:
	if _bones.has(bone_name):
		var q := Quaternion(Vector3(1.0, 0.0, 0.0), pitch) * Quaternion(Vector3(0.0, 1.0, 0.0), twist)
		_skeleton.set_bone_pose_rotation(_bones[bone_name], _rests[bone_name] * q)


func _process(delta: float) -> void:
	_time += delta
	var target := get_node_or_null(target_path) as Node3D

	var swoop := smoothstep(0.8, 0.95, sin(_time * 0.17 + phase * 7.0))
	var glide := smoothstep(0.3, 0.7, sin(_time * 0.31 + phase * 2.0) * 0.5 + 0.5) * glide_blend
	glide *= 1.0 - swoop
	_flap_energy = lerpf(_flap_energy, 1.0 - glide, 1.0 - exp(-2.0 * delta))

	_wing_phase += delta * flap_speed * (1.0 + swoop * 0.6)
	var p := _wing_phase

	if target:
		_orbit_angle += delta * orbit_speed * (1.0 + 0.3 * sin(_time * 0.11 + phase * 5.0) + swoop * 0.8)
		var radius := orbit_radius * (1.0 + 0.25 * sin(_time * 0.07 + phase * 11.0))
		var height := orbit_height * (1.0 + 0.2 * sin(_time * 0.05 + phase * 13.0)) - swoop * swoop_depth
		var bob := sin(_time * 1.7 + phase * 3.0) * 0.6 - sin(p) * 0.12 * _flap_energy
		var goal := target.global_position + Vector3(
			cos(_orbit_angle) * radius,
			height + bob,
			sin(_orbit_angle) * radius)
		var prev := global_position
		global_position = prev.lerp(goal, 1.0 - exp(-follow_speed * delta))
		var vel := global_position - prev
		var flat := Vector3(vel.x, 0.0, vel.z)
		if flat.length_squared() > 0.00001:
			var yaw := atan2(flat.x, flat.z) + model_yaw_fix
			rotation.y = lerp_angle(rotation.y, yaw, 1.0 - exp(-6.0 * delta))
			var yaw_rate := wrapf(rotation.y - _prev_yaw, -PI, PI) / maxf(delta, 0.0001)
			_turn = lerpf(_turn, clampf(yaw_rate, -2.0, 2.0), 1.0 - exp(-4.0 * delta))
			rotation.z = lerp_angle(rotation.z, clampf(-_turn * 0.55, -0.7, 0.7), 1.0 - exp(-3.0 * delta))
			rotation.x = lerp_angle(rotation.x, clampf(-vel.y * 1.5, -0.4, 0.4) - 0.08 - swoop * 0.25, 1.0 - exp(-3.0 * delta))
		_prev_yaw = rotation.y

	if not _skeleton:
		return

	for bone_name in CHAIN:
		var cfg: Array = CHAIN[bone_name]
		var side := 1.0 if bone_name.ends_with(".L") else -1.0
		var asym := 1.0 + side * _turn * turn_flap_asymmetry
		var seg: float = sin(p + cfg[1]) * flap_amount * cfg[0] * _flap_energy * asym
		seg += glide * 0.15 + side * _turn * 0.08
		_pose(bone_name, seg, flap_axis)

	var body_pitch := sin(p - 0.3) * body_pitch_amount * _flap_energy - swoop * 0.1
	var twist := _turn * twist_amount
	_pose2("spine", body_pitch, twist)
	_pose2("spine.001", body_pitch * 0.6, twist * 0.6)

	_pose2("neck.001", -body_pitch * 0.8, _turn * 0.25)
	_pose2("neck.002", -body_pitch * 0.6 + sin(_time * 0.9 + phase) * 0.04, _turn * 0.35)

	var tail_flutter := sin(p - 0.6) * tail_amount * _flap_energy + glide * 0.1 + swoop * 0.15
	_pose("t_feather.L", tail_flutter - _turn * 0.25)
	_pose("t_feather.R", tail_flutter + _turn * 0.25)

	_pose("thigh.L", leg_tuck)
	_pose("thigh.R", leg_tuck)
