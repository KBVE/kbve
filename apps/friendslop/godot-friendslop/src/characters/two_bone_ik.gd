extends RefCounted

## Two-bone IK for a limb whose middle joint is a hinge, which is both of the
## ones a person has: a knee and an elbow differ in where they point, not in how
## they work. Legs plant feet with it and an off hand reaches a weapon's second
## grip with it.
##
## No bend direction is ever chosen. The hinge axis is a fact about the rig,
## taken from the bend the rest pose was authored with, held in the root bone's
## frame and carried by that bone's current rotation -- so a clip that swings
## the limb somewhere else keeps its own bend plane without any of it being
## inferred per frame.
##
## Measuring the plane off the posed triangle instead looks equivalent and is
## not: it degrades exactly where a limb is nearly straight, where the cross
## product is small and its direction is noise. A leg at 158 degrees reported a
## plane 50 degrees off the anatomical one, which the solve then amplified.
##
## The bend is solved on the hinge rather than from the law of cosines, because
## a real hinge is not square to the triangle the three joints make. The cosine
## rule asks for an angle that swings the tip somewhere slightly else and the
## limb lands short of its goal by the difference.


## Puts `tip` on `goal` by bending `mid` and swinging `root`, blended in by
## `amount`. Returns false if the limb is degenerate or the goal unusable, in
## which case nothing was touched.
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
	# Inside the annulus the two bones can actually close, so the solve below
	# stays in range without a clamp papering over a bad pose.
	var span := clampf(to_goal.length(), absf(upper - lower) + 0.001,
			upper + lower - 0.001)
	var dir := to_goal.normalized()

	var axis := hinge_axis(skeleton, root, mid, tip, to_world)
	if axis.length_squared() < 0.00000001:
		return false
	axis = axis.normalized()

	# Turning the middle joint by `x` about the hinge moves the tip on a circle,
	# so the root-to-tip distance falls out as `b*cos(x) + c*sin(x) = d`: one
	# rotation with two roots, the limb bent each way. Taking the root nearer
	# the pose is the same principle as the hinge itself -- the clip already
	# says which way this joint is bent, so nothing has to be assumed about it.
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

	# Bending moved the tip, so the swing that aims the limb is measured after
	# it. Applied to the root, it carries the rest of the limb rigidly and the
	# bend plane rides along with it.
	var bent := (to_world * skeleton.get_bone_global_pose(tip).origin) - r
	if bent.length_squared() > 0.00000001:
		spin(skeleton, root, to_world, Quaternion(bent.normalized(), dir), amount)
	return true


## Turns a bone about its own origin, carrying everything below it.
static func spin(skeleton: Skeleton3D, bone: int, to_world: Transform3D,
		rotation: Quaternion, amount: float) -> void:
	var turn := Quaternion.IDENTITY.slerp(rotation, amount)
	var pose := skeleton.get_bone_global_pose(bone)
	var world_basis := to_world.basis * pose.basis
	skeleton.set_bone_global_pose(bone,
			Transform3D(to_world.basis.inverse() * (Basis(turn) * world_basis), pose.origin))


## The joint's hinge: read off the bend the rest pose was authored with, held in
## the root bone's frame, and handed back in the pose the limb is in now.
##
## The root is the anchor rather than the far bone because that bone's rotation
## is the thing being solved, so reading the axis from it feeds the solve its
## own output. Rest poses with a dead-straight limb have no bend to read, and
## there the root's own side axis is the rig's answer.
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
