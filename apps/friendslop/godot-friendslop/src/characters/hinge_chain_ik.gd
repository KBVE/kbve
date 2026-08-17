extends RefCounted


const TwoBoneIK := preload("res://src/characters/two_bone_ik.gd")

const MAX_BEND := 2.2
const SAMPLES := 24
const BISECTIONS := 8
const EPSILON := 0.000001


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


static func tip(skeleton: Skeleton3D, bones: PackedInt32Array, tip_local: Vector3,
		to_world: Transform3D) -> Vector3:
	return to_world * (skeleton.get_bone_global_pose(bones[bones.size() - 1]) * tip_local)


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


static func rest_limits(skeleton: Skeleton3D, bones: PackedInt32Array,
		tip_local: Vector3) -> Vector2:
	var joints := PackedVector3Array()
	var axes := PackedVector3Array()
	for j in bones.size():
		joints.append(skeleton.get_bone_global_rest(bones[j]).origin)
		axes.append(Vector3.ZERO if j == 0 else _rest_axis(skeleton, bones, tip_local, j))
	var tip := _rest_tip(skeleton, bones, tip_local)
	var low := INF
	var high := 0.0
	for i in SAMPLES + 1:
		var span := _reach(joints, tip, axes, -MAX_BEND + MAX_BEND * 2.0 / SAMPLES * i)
		low = minf(low, span)
		high = maxf(high, span)
	return Vector2(low, high)


static func _rest_axis(skeleton: Skeleton3D, bones: PackedInt32Array, tip_local: Vector3,
		j: int) -> Vector3:
	var above := skeleton.get_bone_global_rest(bones[j - 1]).origin
	var here := skeleton.get_bone_global_rest(bones[j]).origin
	var beyond := _rest_tip(skeleton, bones, tip_local) if j == bones.size() - 1 \
			else skeleton.get_bone_global_rest(bones[j + 1]).origin
	return (above - here).cross(beyond - here)


static func _bend_for(joints: PackedVector3Array, tip: Vector3, axes: PackedVector3Array,
		span: float) -> float:
	var step := MAX_BEND * 2.0 / SAMPLES
	var previous := _reach(joints, tip, axes, -MAX_BEND)
	var best := -MAX_BEND
	var best_error := absf(previous - span)
	var low := 0.0
	var high := 0.0
	var found := false

	for i in range(1, SAMPLES + 1):
		var bend := -MAX_BEND + step * i
		var here := _reach(joints, tip, axes, bend)
		if absf(here - span) < best_error:
			best_error = absf(here - span)
			best = bend
		if (previous - span) * (here - span) <= 0.0:
			var edge := maxf(absf(bend), absf(bend - step))
			if not found or edge < maxf(absf(high), absf(low)):
				low = bend - step
				high = bend
				found = true
		previous = here

	if not found:
		return best
	for pass_ in BISECTIONS:
		var mid := (low + high) * 0.5
		if (_reach(joints, tip, axes, low) - span) * (_reach(joints, tip, axes, mid) - span) <= 0.0:
			high = mid
		else:
			low = mid
	return (low + high) * 0.5


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
