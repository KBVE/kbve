class_name WingRig
extends RefCounted

var species: BirdSpecies
var _skeleton: Skeleton3D
var _bones := {}
var _rests := {}


func setup(s: BirdSpecies, root: Node) -> void:
	species = s
	_skeleton = _find_skeleton(root)
	if not _skeleton:
		return
	var wanted := species.wing_chain + species.spine_bones + species.neck_bones + species.tail_bones + species.leg_bones
	for bone_name in wanted:
		var idx := _skeleton.find_bone(bone_name)
		if idx >= 0:
			_bones[bone_name] = idx
			_rests[bone_name] = _skeleton.get_bone_pose_rotation(idx)


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


func step(flight: FlightPath) -> void:
	if not _skeleton:
		return
	var p := flight.wing_phase
	for i in species.wing_chain.size():
		var bone_name := species.wing_chain[i]
		var side := 1.0 if bone_name.ends_with(".L") else -1.0
		var asym := 1.0 + side * flight.turn * species.turn_flap_asymmetry
		var seg := sin(p + species.chain_lag[i]) * species.flap_amount * species.chain_falloff[i] * flight.flap_energy * asym
		seg += flight.glide * 0.15 + side * flight.turn * 0.08
		_pose(bone_name, seg, species.flap_axis)

	var body_pitch := sin(p - 0.3) * species.body_pitch_amount * flight.flap_energy - flight.swoop * 0.1
	var twist := flight.turn * species.twist_amount
	var fall := 1.0
	for bone_name in species.spine_bones:
		_pose2(bone_name, body_pitch * fall, twist * fall)
		fall *= 0.6

	fall = 0.8
	for bone_name in species.neck_bones:
		_pose2(bone_name, -body_pitch * fall + sin(flight.time * 0.9 + flight.phase) * 0.04 * (1.0 - fall), flight.turn * (0.6 - fall * 0.4))
		fall -= 0.2

	var tail_flutter := sin(p - 0.6) * species.tail_amount * flight.flap_energy + flight.glide * 0.1 + flight.swoop * 0.15
	for bone_name in species.tail_bones:
		var side := 1.0 if bone_name.ends_with(".L") else -1.0
		_pose(bone_name, tail_flutter - side * flight.turn * 0.25)

	for bone_name in species.leg_bones:
		_pose(bone_name, species.leg_tuck)
