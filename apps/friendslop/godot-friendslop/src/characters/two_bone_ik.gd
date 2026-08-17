extends RefCounted


static func solve(skeleton: Skeleton3D, root: int, mid: int, tip: int,
		goal: Vector3, amount: float) -> bool:
	if root < 0 or mid < 0 or tip < 0:
		return false
	var to_world := skeleton.global_transform
	var r := to_world * skeleton.get_bone_global_pose(root).origin
	var m := to_world * skeleton.get_bone_global_pose(mid).origin
	var t := to_world * skeleton.get_bone_global_pose(tip).origin
	var upper := r.distance_to(m)
	var lower := m.distance_to(t)
	if upper < 0.0001 or lower < 0.0001:
		return false

	var to_goal := goal - r
	if to_goal.length_squared() < 0.00000001:
		return false
	var span := clampf(to_goal.length(), absf(upper - lower) + 0.001,
			upper + lower - 0.001)
	var dir := to_goal.normalized()

	var axis := hinge_axis(skeleton, root, mid, tip, to_world)
	if axis.length_squared() < 0.00000001:
		return false
	axis = axis.normalized()

	var v := r - m
	var u := t - m
	var flat := u - axis * u.dot(axis)
	var b := flat.dot(v)
	var c := axis.cross(flat).dot(v)
	var reach := sqrt(b * b + c * c)
	if reach < 0.000001:
		return false
	var d := (u.length_squared() + v.length_squared() - span * span) * 0.5 \
			- u.dot(axis) * axis.dot(v)
	var phase := atan2(c, b)
	var spread := acos(clampf(d / reach, -1.0, 1.0))
	var near := wrapf(phase + spread, -PI, PI)
	var far := wrapf(phase - spread, -PI, PI)
	spin(skeleton, mid, to_world, Quaternion(axis, near if absf(near) < absf(far) else far),
			amount)

	var bent := (to_world * skeleton.get_bone_global_pose(tip).origin) - r
	if bent.length_squared() > 0.00000001:
		spin(skeleton, root, to_world, Quaternion(bent.normalized(), dir), amount)
	return true


static func spin(skeleton: Skeleton3D, bone: int, to_world: Transform3D,
		rotation: Quaternion, amount: float) -> void:
	var turn := Quaternion.IDENTITY.slerp(rotation, amount)
	var pose := skeleton.get_bone_global_pose(bone)
	var world_basis := to_world.basis * pose.basis
	skeleton.set_bone_global_pose(bone,
			Transform3D(to_world.basis.inverse() * (Basis(turn) * world_basis), pose.origin))


static func hinge_axis(skeleton: Skeleton3D, root: int, mid: int, tip: int,
		to_world: Transform3D) -> Vector3:
	var root_rest := skeleton.get_bone_global_rest(root)
	var mid_rest := skeleton.get_bone_global_rest(mid).origin
	var axis := (root_rest.origin - mid_rest).cross(
			skeleton.get_bone_global_rest(tip).origin - mid_rest)
	var local := root_rest.basis.x
	if axis.length_squared() > 0.00000001:
		local = root_rest.basis.inverse() * axis
	return to_world.basis * skeleton.get_bone_global_pose(root).basis * local
