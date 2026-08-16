extends GdUnitTestSuite

const Rig := preload("res://src/characters/character_rig.gd")


## States built out of a blend tree rather than a single clip, so their STATES entry
## names no clip of its own.
const COMPOSED := [&"move", &"crouch"]


## Every chain the rig actually builds the machine from. Missing one here reads as a state
## nothing can reach, when the truth is a test that was not told about it.
func _links() -> Array:
	return Rig.JUMP_CHAIN + Rig.CLIMB_CHAIN + Rig.CROUCH_CHAIN + Rig.roll_chain() \
			+ Rig.TURN_CHAIN + Rig.work_chain()


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
			QLocomotion.STANCE_CROUCH, QLocomotion.STANCE_ROLL, QLocomotion.STANCE_LAND,
			QLocomotion.STANCE_TURN_90_LEFT, QLocomotion.STANCE_TURN_90_RIGHT,
			QLocomotion.STANCE_TURN_180_LEFT, QLocomotion.STANCE_TURN_180_RIGHT]
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
	for state in Rig.FITTED:
		assert_float(rig.window_for(state)) \
				.override_failure_message("'%s' is fitted to nothing" % state).is_greater(0.0)
	rig.free()


## The state machine measures a clip at the length it was authored at and knows nothing
## about the time scale above it, so an at_end exit from a fitted state overstays by the
## fitted rate -- which is long enough for the clip to come round and play a second time.
## Every fitted state is therefore walked out of deliberately, never on at_end.
func test_no_fitted_state_exits_on_a_clip_boundary() -> void:
	var fitted := Rig.FITTED.keys() + Rig.ROLL_STATES
	for link in _links():
		if not fitted.has(StringName(link.from)):
			continue
		assert_bool(link.at_end) \
				.override_failure_message(
					"'%s' is replayed to fit but exits on at_end, so it plays twice" % link.from) \
				.is_false()


## Every fitted state has to be left by somebody: the rig walks the ones the simulation
## is not tracking, QLocomotion owns the rest.
func test_every_fitted_state_has_an_owner() -> void:
	var owned := {}
	for state in Rig.SHOT_NEXT:
		owned[state] = true
	for state in Rig.ROLL_STATES:
		owned[state] = true
	owned[&"jump_land"] = true
	for state in Rig.FITTED:
		assert_bool(owned.has(state)) \
				.override_failure_message("nothing ends '%s'" % state).is_true()
	for state in Rig.SHOT_NEXT:
		assert_bool(Rig.STATES.has(Rig.SHOT_NEXT[state])) \
				.override_failure_message("'%s' steps to a missing state" % state).is_true()


## Each quarter is drawn with its own clip, and every one of them has to exist.
func test_each_roll_quarter_has_its_own_clip() -> void:
	assert_int(Rig.ROLL_STATES.size()).is_equal(4)
	var clips := {}
	for state in Rig.ROLL_STATES:
		assert_bool(Rig.STATES.has(state)) \
				.override_failure_message("no STATES entry for '%s'" % state).is_true()
		var clip: String = Rig.STATES[state].clip
		assert_str(clip).is_not_empty()
		clips[clip] = true
	assert_int(clips.size()).is_equal(4)
	assert_str(Rig.STATES[Rig.ROLL_STATES[0]].clip).is_equal("UAL1/Roll")


## The clip follows the heading the roll was thrown on. Axes here are in Q's own frame,
## the one character_rig hands it: y forward, x right.
func test_the_roll_quarter_follows_the_heading() -> void:
	var thrown := {Vector2(0.0, 1.0): 0, Vector2(0.0, -1.0): 1, Vector2(-1.0, 0.0): 2,
			Vector2(1.0, 0.0): 3}
	for axis in thrown:
		var fresh := QLocomotion.create()
		fresh.step_motion(axis, false, false, true, Vector3.ZERO, 0.0, true, -9.8, 1.0 / 60.0)
		assert_int(fresh.roll_variant()) \
				.override_failure_message("%s picked the wrong quarter" % axis) \
				.is_equal(thrown[axis])
	## No stick on it rolls straight ahead.
	assert_int(QLocomotion.create().roll_variant()).is_equal(0)


## Both stances have to be leavable, or a crouch is a trap.
func test_crouch_and_roll_return_to_move() -> void:
	var out := {}
	for link in _links():
		out[StringName(link.from)] = true
	for state in [&"crouch", &"crouch_enter", &"crouch_exit"] + Rig.ROLL_STATES:
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


## The kit models face +z and Godot's forward is -z, so a heading read the wrong way round
## is a character that sprints backwards while the ring plays it the backpedal. That is
## what every online avatar did, and nothing in the tree noticed.
func test_a_driven_body_faces_the_way_it_travels() -> void:
	for travel in [Vector3(0, 0, -4), Vector3(4, 0, 0), Vector3(-3, 0, 3)]:
		var avatar: Node3D = load("res://scenes/net_avatar.tscn").instantiate()
		add_child(avatar)
		await get_tree().process_frame
		for i in 240:
			avatar.global_position += travel * (1.0 / 60.0)
			avatar._process(1.0 / 60.0)
		var rig: Node3D = avatar.get_node("Mesh")
		var forward: Vector3 = -rig.global_transform.basis.z
		assert_float(forward.normalized().dot(travel.normalized())) \
				.override_failure_message("travelling %s the body faced %s" % [travel, forward]) \
				.is_greater(0.99)
		assert_float(rig.loco.blend().y) \
				.override_failure_message("travelling %s the ring played %s" % [travel, rig.loco.blend()]) \
				.is_greater(0.5)
		avatar.queue_free()


## Standing still and swinging the camera has to turn the body, or there is no way to be
## ready to move before moving. A glance must not, or looking around drags the feet.
func test_a_standing_body_turns_to_a_committed_look_but_not_a_glance() -> void:
	var loco := QLocomotion.create()
	for i in 120:
		loco.face(Vector3.ZERO, 0.5, 1.0 / 60.0)
	assert_float(loco.face(Vector3.ZERO, 0.5, 1.0 / 60.0)).is_equal(0.0)
	for i in 240:
		loco.face(Vector3.ZERO, 1.4, 1.0 / 60.0)
	assert_float(loco.face(Vector3.ZERO, 1.4, 1.0 / 60.0)).is_equal_approx(1.4, 0.02)


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
