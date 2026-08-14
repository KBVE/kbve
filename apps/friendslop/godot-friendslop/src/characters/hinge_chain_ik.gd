extends RefCounted

## IK for a chain of hinge joints ending in a point the last bone carries, which is how
## the mech pack rigs a leg: the foot is a sibling control, not a child of the shin, so
## there is no tip bone to solve to.

const TwoBoneIK := preload("res://src/characters/two_bone_ik.gd")

## Bend swept while bracketing the solution, each way from the posed bend.
const MAX_BEND := 2.2
const BISECTIONS := 12
const EPSILON := 0.000001


## Bends every joint below the root by a shared angle until the tip is `goal` away, then
## swings the root to aim at it. Blended in by `amount`.
static func solve(skeleton: Skeleton3D, bones: PackedInt32Array, tip_local: Vector3,
		goal: Vector3, amount: float) -> bool:
	if bones.size() < 2 or amount <= 0.001:
		return false
	var to_world := skeleton.global_transform
	var joints := PackedVector3Array()
	for bone in bones:
		joints.append(to_world * skeleton.get_bone_global_pose(bone).origin)
	var tip := tip(skeleton, bones, tip_local, to_world)
	var axes := PackedVector3Array()
	for j in bones.size():
		axes.append(Vector3.ZERO if j == 0 else axis(skeleton, bones, tip_local, j, to_world))

	var root := joints[0]
	var span := root.distance_to(goal)
	if span < EPSILON:
		return false

	var bend := _bend_for(joints, tip, axes, span)
	for j in range(1, bones.size()):
		var live := axis(skeleton, bones, tip_local, j, to_world)
		if live.length_squared() < EPSILON:
			continue
		TwoBoneIK.spin(skeleton, bones[j], to_world,
				Quaternion(live.normalized(), bend), amount)

	var bent := tip(skeleton, bones, tip_local, to_world) - root
	var wanted := goal - root
	if bent.length_squared() < EPSILON or wanted.length_squared() < EPSILON:
		return true
	TwoBoneIK.spin(skeleton, bones[0], to_world,
			Quaternion(bent.normalized(), wanted.normalized()), amount)
	return true


## Where the tip sits right now, in world space.
static func tip(skeleton: Skeleton3D, bones: PackedInt32Array, tip_local: Vector3,
		to_world: Transform3D) -> Vector3:
	return to_world * (skeleton.get_bone_global_pose(bones[bones.size() - 1]) * tip_local)


## Joint `j`'s hinge, read off the bend the rest pose was authored with and handed back in
## the pose the chain is in now. Held in the frame of the bone above the joint, so it
## follows whatever the joints closer to the root have already been turned by.
static func axis(skeleton: Skeleton3D, bones: PackedInt32Array, tip_local: Vector3,
		j: int, to_world: Transform3D) -> Vector3:
	var above := bones[j - 1]
	var above_rest := skeleton.get_bone_global_rest(above)
	var here := skeleton.get_bone_global_rest(bones[j]).origin
	var beyond := _rest_tip(skeleton, bones, tip_local) if j == bones.size() - 1 \
			else skeleton.get_bone_global_rest(bones[j + 1]).origin
	var rest_axis := (above_rest.origin - here).cross(beyond - here)
	var local := above_rest.basis.x
	if rest_axis.length_squared() > EPSILON:
		local = above_rest.basis.inverse() * rest_axis
	return to_world.basis * skeleton.get_bone_global_pose(above).basis * local


static func _rest_tip(skeleton: Skeleton3D, bones: PackedInt32Array,
		tip_local: Vector3) -> Vector3:
	return skeleton.get_bone_global_rest(bones[bones.size() - 1]) * tip_local


## Shortest and longest the chain can be from its root, which for a folded leg is nothing
## like the sum of its bones.
static func rest_limits(skeleton: Skeleton3D, bones: PackedInt32Array,
		tip_local: Vector3) -> Vector2:
	var joints := PackedVector3Array()
	var axes := PackedVector3Array()
	for j in bones.size():
		joints.append(skeleton.get_bone_global_rest(bones[j]).origin)
		axes.append(Vector3.ZERO if j == 0 else _rest_axis(skeleton, bones, tip_local, j))
	var tip := _rest_tip(skeleton, bones, tip_local)
	var one := _reach(joints, tip, axes, MAX_BEND)
	var other := _reach(joints, tip, axes, -MAX_BEND)
	return Vector2(minf(one, other), maxf(one, other))


static func _rest_axis(skeleton: Skeleton3D, bones: PackedInt32Array, tip_local: Vector3,
		j: int) -> Vector3:
	var above := skeleton.get_bone_global_rest(bones[j - 1]).origin
	var here := skeleton.get_bone_global_rest(bones[j]).origin
	var beyond := _rest_tip(skeleton, bones, tip_local) if j == bones.size() - 1 \
			else skeleton.get_bone_global_rest(bones[j + 1]).origin
	return (above - here).cross(beyond - here)


## Bisects the shared joint angle that puts the tip `span` from the root. Curling every
## hinge the same way is monotonic in the tip's distance, so the bracket cannot straddle
## two answers; which sign curls is read off the pose rather than assumed, because the
## packs disagree on which way a knee bends.
static func _bend_for(joints: PackedVector3Array, tip: Vector3, axes: PackedVector3Array,
		span: float) -> float:
	var curl := 1.0 if _reach(joints, tip, axes, 0.05) <= _reach(joints, tip, axes, -0.05) \
			else -1.0
	var shortest := _reach(joints, tip, axes, curl * MAX_BEND)
	var longest := _reach(joints, tip, axes, -curl * MAX_BEND)
	if span <= shortest:
		return curl * MAX_BEND
	if span >= longest:
		return -curl * MAX_BEND

	var low := -MAX_BEND
	var high := MAX_BEND
	for step in BISECTIONS:
		var mid := (low + high) * 0.5
		if _reach(joints, tip, axes, curl * mid) > span:
			low = mid
		else:
			high = mid
	return curl * (low + high) * 0.5


## Tip distance the chain would have if every joint turned by `bend`, without touching the
## skeleton.
static func _reach(joints: PackedVector3Array, tip: Vector3, axes: PackedVector3Array,
		bend: float) -> float:
	var points := joints.duplicate()
	var hinges := axes.duplicate()
	var end := tip
	for j in range(1, points.size()):
		if hinges[j].length_squared() < EPSILON:
			continue
		var turn := Basis(hinges[j].normalized(), bend)
		var pivot := points[j]
		for k in range(j + 1, points.size()):
			points[k] = pivot + turn * (points[k] - pivot)
			hinges[k] = turn * hinges[k]
		end = pivot + turn * (end - pivot)
	return points[0].distance_to(end)
