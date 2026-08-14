extends GdUnitTestSuite

const ChainIK := preload("res://src/characters/hinge_chain_ik.gd")

## Ankle offset from the last bone, standing in for the mech pack's sibling foot control.
const ANKLE := Vector3(0.0, -0.9, 0.15)


## Straight is the awkward case: bending a straight chain either way shortens it, so the
## span is not monotonic in the bend and a blind bisection walks off the wrong side.
func _leg(bent: bool, joints: int) -> Skeleton3D:
	var skeleton := Skeleton3D.new()
	add_child(skeleton)
	auto_free(skeleton)
	var offsets: Array[Vector3] = []
	if joints == 3:
		offsets = [Vector3(0.0, 2.4, 0.0), Vector3(0.0, -1.1, 0.4 if bent else 0.0),
				Vector3(0.0, -1.0, -0.5 if bent else 0.0)]
	else:
		offsets = [Vector3(0.0, 2.4, 0.0), Vector3(0.0, -1.2, 0.35 if bent else 0.0)]
	for i in offsets.size():
		skeleton.add_bone("bone_%d" % i)
		if i > 0:
			skeleton.set_bone_parent(i, i - 1)
		skeleton.set_bone_rest(i, Transform3D(Basis.IDENTITY, offsets[i]))
	skeleton.reset_bone_poses()
	return skeleton


func _chain(skeleton: Skeleton3D) -> PackedInt32Array:
	var bones := PackedInt32Array()
	for i in skeleton.get_bone_count():
		bones.append(i)
	return bones


func _tip_local(skeleton: Skeleton3D, bones: PackedInt32Array) -> Vector3:
	var last := bones[bones.size() - 1]
	return skeleton.get_bone_global_rest(last).affine_inverse() \
			* (skeleton.get_bone_global_rest(last).origin + ANKLE)


## Goals are pulled into the chain's own span, since a leg that cannot reach is a
## different case with its own test.
func _lands_on_goal(bent: bool, joints: int, drop: float, side: float) -> void:
	var skeleton := _leg(bent, joints)
	var bones := _chain(skeleton)
	var tip_local := _tip_local(skeleton, bones)
	var to_world := skeleton.global_transform
	var limits := ChainIK.rest_limits(skeleton, bones, tip_local)
	var root := to_world * skeleton.get_bone_global_pose(bones[0]).origin
	var goal := ChainIK.tip(skeleton, bones, tip_local, to_world) + Vector3(0.0, drop, side)
	var span := clampf(root.distance_to(goal), limits.x + 0.05, limits.y - 0.05)
	goal = root + (goal - root).normalized() * span
	assert_bool(ChainIK.solve(skeleton, bones, tip_local, goal, 1.0)).is_true()
	var landed := ChainIK.tip(skeleton, bones, tip_local, to_world)
	assert_float(landed.distance_to(goal)) \
			.override_failure_message("%d-bone %s leg missed %s by %s" % [joints,
					"bent" if bent else "straight", goal, landed]) \
			.is_less(0.02)


func test_a_bent_two_bone_leg_reaches_its_goal() -> void:
	_lands_on_goal(true, 2, -0.4, 0.3)


func test_a_straight_two_bone_leg_reaches_its_goal() -> void:
	_lands_on_goal(false, 2, -0.5, 0.25)


func test_a_bent_three_bone_leg_reaches_its_goal() -> void:
	_lands_on_goal(true, 3, -0.5, 0.35)


func test_a_straight_three_bone_leg_reaches_its_goal() -> void:
	_lands_on_goal(false, 3, -0.6, 0.3)


## Stepping up shortens the leg, which is the half of the range a solver that only ever
## straightens gets wrong.
func test_a_leg_folds_to_reach_a_step_up() -> void:
	_lands_on_goal(true, 3, 0.5, 0.2)
	_lands_on_goal(true, 2, 0.4, 0.2)


## Past its span the chain goes as far as it can, in the right direction, instead of
## flipping or giving up.
func test_an_unreachable_goal_extends_toward_it() -> void:
	var skeleton := _leg(true, 3)
	var bones := _chain(skeleton)
	var tip_local := _tip_local(skeleton, bones)
	var to_world := skeleton.global_transform
	var root := to_world * skeleton.get_bone_global_pose(bones[0]).origin
	var before := ChainIK.tip(skeleton, bones, tip_local, to_world)
	var goal := root + (Vector3(0.0, -1.0, 0.4).normalized() * 40.0)
	assert_bool(ChainIK.solve(skeleton, bones, tip_local, goal, 1.0)).is_true()
	var landed := ChainIK.tip(skeleton, bones, tip_local, to_world)
	assert_float(root.distance_to(landed)).is_greater(root.distance_to(before))
	assert_float(landed.distance_to(goal)).is_less(before.distance_to(goal))


## What the leg can span, which the foot solver reads to know when to drop the body.
func test_rest_limits_bracket_the_pose_it_was_authored_in() -> void:
	for joints in [2, 3]:
		for bent in [true, false]:
			var skeleton := _leg(bent, joints)
			var bones := _chain(skeleton)
			var tip_local := _tip_local(skeleton, bones)
			var limits := ChainIK.rest_limits(skeleton, bones, tip_local)
			var rest := skeleton.get_bone_global_rest(bones[0]).origin.distance_to(
					ChainIK.tip(skeleton, bones, tip_local, skeleton.global_transform))
			assert_float(limits.x).is_less_equal(rest + 0.001)
			assert_float(limits.y) \
					.override_failure_message("%d-bone %s leg cannot reach its own rest pose" % [
							joints, "bent" if bent else "straight"]) \
					.is_greater_equal(rest - 0.001)


func test_a_single_bone_has_nothing_to_solve() -> void:
	var skeleton := _leg(true, 2)
	assert_bool(ChainIK.solve(skeleton, PackedInt32Array([0]), Vector3.ZERO,
			Vector3.ZERO, 1.0)).is_false()
