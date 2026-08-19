extends GdUnitTestSuite


const NetCameraRigScript := preload("res://src/net/net_camera_rig.gd")

## The rig reads [member Input.mouse_mode] to decide whether it holds the pointer, and
## a headless runner can never capture it -- setting it leaves it visible. So the turn
## itself is driven directly, which is the part with the decision in it anyway.


func _rig() -> NetCameraRig:
	var rig: NetCameraRig = NetCameraRigScript.new()
	add_child(rig)
	auto_free(rig)
	return rig


## The first report after the window takes the pointer is the warp, not a turn.
func test_the_capture_jump_does_not_spin_the_camera() -> void:
	var rig := _rig()
	rig.apply_pointer(Vector2(rig.CAPTURE_JUMP_PX + 50.0, 0.0))
	assert_float(rig.intent_basis()).override_failure_message(
		"the pointer warp on capture was taken for a turn"
	).is_equal_approx(0.0, 0.0001)


## Everything after it is a turn, however big.
##
## Godot merges pending motion into one event, so a fast flick -- or an ordinary turn
## across a frame that ran long -- arrives as one large delta. Dropping those is what
## makes the camera feel like it is lagging behind the mouse.
func test_a_fast_flick_still_turns_the_camera() -> void:
	var rig := _rig()
	rig.apply_pointer(Vector2(1.0, 0.0))
	var settled := rig.intent_basis()
	var flick: float = rig.CAPTURE_JUMP_PX * 3.0
	rig.apply_pointer(Vector2(flick, 0.0))
	assert_float(absf(rig.intent_basis() - settled)).override_failure_message(
		"a flick of %d px turned the camera by nothing; large motions are being dropped"
			% flick
	).is_equal_approx(flick * rig.sensitivity, 0.0001)


## Letting the pointer go and taking it again arms the guard afresh, because the
## pointer warps a second time.
func test_releasing_the_pointer_arms_the_guard_again() -> void:
	var rig := _rig()
	rig.apply_pointer(Vector2(1.0, 0.0))
	var settled := rig.intent_basis()
	rig.release_pointer()
	rig.apply_pointer(Vector2(rig.CAPTURE_JUMP_PX + 50.0, 0.0))
	assert_float(rig.intent_basis()).override_failure_message(
		"the warp after a second capture was taken for a turn"
	).is_equal_approx(settled, 0.0001)


## Pitch stays inside its limits however far the mouse is thrown.
func test_a_hard_pull_cannot_flip_the_camera_over() -> void:
	var rig := _rig()
	rig.apply_pointer(Vector2(1.0, 0.0))
	rig.apply_pointer(Vector2(0.0, -100000.0))
	assert_float(rig._pitch).is_less_equal(rig.pitch_limits.y + 0.0001)
	rig.apply_pointer(Vector2(0.0, 100000.0))
	assert_float(rig._pitch).is_greater_equal(rig.pitch_limits.x - 0.0001)
