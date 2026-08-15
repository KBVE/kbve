extends GdUnitTestSuite

const Rig := preload("res://src/characters/character_rig.gd")


## States built out of a blend tree rather than a single clip, so their STATES entry
## names no clip of its own.
const COMPOSED := [&"move", &"crouch", &"roll"]


func _links() -> Array:
	return Rig.JUMP_CHAIN + Rig.CLIMB_CHAIN + Rig.CROUCH_CHAIN + Rig.ROLL_CHAIN


## A state named in a transition but missing from STATES takes the tree build down with
## it, since the build reads reset off the entry.
func test_every_transition_endpoint_is_described() -> void:
	for link in _links():
		assert_bool(Rig.STATES.has(StringName(link.from))) \
				.override_failure_message("no STATES entry for '%s'" % link.from).is_true()
		assert_bool(Rig.STATES.has(StringName(link.to))) \
				.override_failure_message("no STATES entry for '%s'" % link.to).is_true()


func test_every_state_is_reachable() -> void:
	var reachable := {&"move": true}
	for link in _links():
		reachable[StringName(link.to)] = true
	for state in Rig.STATES:
		assert_bool(reachable.has(state)) \
				.override_failure_message("'%s' has no transition into it" % state).is_true()


func test_states_are_fully_specified() -> void:
	for state in Rig.STATES:
		var cfg: Dictionary = Rig.STATES[state]
		assert_bool(cfg.has(&"reset")).is_true()
		assert_bool(cfg.has(&"ik")).is_true()
		assert_bool(cfg.has(&"clip")).is_true()
		assert_float(cfg[&"ik"]).is_between(0.0, 1.0)
	for state in Rig.STATES:
		if COMPOSED.has(state):
			assert_str(Rig.STATES[state][&"clip"]).is_empty()
		else:
			assert_str(Rig.STATES[state][&"clip"]).is_not_empty()


## QLocomotion decides in stances and the machine is addressed by name, so an unmapped
## stance is a state the rig can be asked to travel to and cannot.
func test_every_stance_maps_to_a_real_state() -> void:
	var stances := [QLocomotion.STANCE_MOVE, QLocomotion.STANCE_JUMP,
			QLocomotion.STANCE_CLIMB_LOW, QLocomotion.STANCE_CLIMB_HIGH,
			QLocomotion.STANCE_CROUCH, QLocomotion.STANCE_ROLL, QLocomotion.STANCE_LAND]
	for stance in stances:
		assert_bool(Rig.STANCE_STATES.has(stance)) \
				.override_failure_message("stance %d is unmapped" % stance).is_true()
		assert_bool(Rig.STATES.has(Rig.STANCE_STATES[stance])) \
				.override_failure_message("stance %d maps to a missing state" % stance).is_true()
	assert_int(Rig.STANCE_STATES.size()).is_equal(stances.size())


## The ring the clips are laid out on has to be the ring Q solves radii against.
func test_clip_rings_match_the_rust_gait_radii() -> void:
	var loco := QLocomotion.create()
	assert_float(loco.gait_speed(Vector2(0.0, 1.0))).is_greater(0.0)
	assert_int(Rig.GAIT_CLIPS.size()).is_equal(2)
	assert_float(Rig.GAIT_CLIPS[0].radius).is_equal(1.0)
	assert_float(Rig.GAIT_CLIPS[1].radius).is_equal(2.0)


## The locomotion cycle has to survive a round trip through the air; a one-shot has to
## start from its own first frame every time it is played.
func test_locomotion_resumes_but_one_shots_restart() -> void:
	assert_bool(Rig.STATES[&"move"][&"reset"]).is_false()
	assert_bool(Rig.STATES[&"crouch"][&"reset"]).is_false()
	for state in Rig.STATES:
		if state == &"move" or state == &"crouch":
			continue
		assert_bool(Rig.STATES[state][&"reset"]) \
				.override_failure_message("'%s' should restart" % state).is_true()


## `travel` will not path through a disabled transition, and with no route to the state
## it was asked for the playback hard-cuts instead of cross-fading. Every link therefore
## has to be reachable by hand, and only the ones that chain on their own may be AUTO.
func test_no_transition_is_closed_to_travel() -> void:
	var rig := Rig.new()
	for link in _links():
		var t: AnimationNodeStateMachineTransition = rig._transition(link)
		assert_int(t.advance_mode) \
				.override_failure_message("%s -> %s is closed to travel" % [link.from, link.to]) \
				.is_not_equal(AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED)
		var wanted := AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO if link.at_end \
				else AnimationNodeStateMachineTransition.ADVANCE_MODE_ENABLED
		assert_int(t.advance_mode).is_equal(wanted)
		assert_float(t.xfade_time) \
				.override_failure_message("%s -> %s cuts" % [link.from, link.to]).is_greater(0.0)
	rig.free()


## The landing clip is a single pose, not a ring, so every frame of it spent travelling
## is a frame of skating. Unlike a climb or a roll -- which own the body deliberately and
## must play out -- the air states have to be leavable on the frame they are asked to be,
## not at a clip boundary.
func test_the_air_states_are_left_on_demand() -> void:
	var immediate := {}
	for link in _links():
		if link.to == "move" and not link.at_end:
			immediate[StringName(link.from)] = true
	for state in [&"jump_land", &"jump", &"jump_start"]:
		assert_bool(immediate.has(state)) \
				.override_failure_message("'%s' can only be left at a clip boundary" % state) \
				.is_true()


## A one-shot the kit authored longer than the moment it covers has to be replayed to
## fit, or the simulation moves on without it.
func test_every_fitted_one_shot_has_a_window() -> void:
	var rig := Rig.new()
	for window in [rig.takeoff_time, rig.landing_time, rig.crouch_shift_time]:
		assert_float(window).is_greater(0.0)
	assert_float(rig.landing_time).is_less(1.267)
	assert_float(rig.takeoff_time).is_less(1.333)
	rig.free()


## Both stances have to be leavable, or a crouch is a trap.
func test_crouch_and_roll_return_to_move() -> void:
	var out := {}
	for link in _links():
		out[StringName(link.from)] = true
	for state in [&"crouch", &"crouch_enter", &"crouch_exit", &"roll"]:
		assert_bool(out.has(state)) \
				.override_failure_message("'%s' has no way out" % state).is_true()


## Crouch is a ring of its own rather than a rung on the standing ladder, and the radius
## it is laid out on has to be the one Q solves crouch headings against.
func test_the_crouch_ring_is_its_own() -> void:
	assert_int(Rig.CROUCH_GAIT_CLIPS.size()).is_equal(1)
	assert_float(Rig.CROUCH_GAIT_CLIPS[0].radius).is_equal(1.0)
	var loco := QLocomotion.create()
	var walked := loco.gait_speed(Vector2(0.0, 1.0))
	loco.step_motion(Vector2(0.0, 1.0), false, true, false, Vector3.ZERO, 0.0, true, -9.8, 1.0 / 60.0)
	assert_float(loco.gait_speed(Vector2(0.0, 1.0))).is_less(walked)
	assert_bool(loco.is_crouched()).is_true()


func test_air_hands_the_legs_back() -> void:
	assert_float(Rig.STATES[&"jump"][&"ik"]).is_equal(0.0)
	assert_float(Rig.STATES[&"climb_low"][&"ik"]).is_equal(0.0)
	assert_float(Rig.STATES[&"climb_high"][&"ik"]).is_equal(0.0)
	assert_float(Rig.STATES[&"move"][&"ik"]).is_equal(1.0)


func test_ground_weight_follows_the_crossfade() -> void:
	var rig := Rig.new()
	assert_float(rig.ground_weight_for(&"move", &"jump_land", 0.0)).is_equal_approx(0.7, 0.001)
	assert_float(rig.ground_weight_for(&"move", &"jump_land", 0.5)).is_equal_approx(0.85, 0.001)
	assert_float(rig.ground_weight_for(&"move", &"jump_land", 1.0)).is_equal_approx(1.0, 0.001)
	assert_float(rig.ground_weight_for(&"jump", &"jump_start", 0.5)).is_equal_approx(0.2, 0.001)
	assert_float(rig.ground_weight_for(&"move", &"", 0.0)).is_equal(1.0)
	assert_float(rig.ground_weight_for(&"move", &"jump_land", 4.0)).is_equal(1.0)
	assert_float(rig.ground_weight_for(&"move", &"jump_land", -4.0)).is_equal_approx(0.7, 0.001)
	assert_float(rig.ground_weight_for(&"nonexistent", &"", 0.0)).is_equal(1.0)
	rig.free()
