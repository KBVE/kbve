extends GdUnitTestSuite

const Rig := preload("res://src/characters/character_rig.gd")


func _links() -> Array:
	return Rig.JUMP_CHAIN + Rig.CLIMB_CHAIN


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
	assert_str(Rig.STATES[&"move"][&"clip"]).is_empty()
	for state in Rig.STATES:
		if state != &"move":
			assert_str(Rig.STATES[state][&"clip"]).is_not_empty()


## QLocomotion decides in stances and the machine is addressed by name, so an unmapped
## stance is a state the rig can be asked to travel to and cannot.
func test_every_stance_maps_to_a_real_state() -> void:
	var stances := [QLocomotion.STANCE_MOVE, QLocomotion.STANCE_JUMP,
			QLocomotion.STANCE_CLIMB_LOW, QLocomotion.STANCE_CLIMB_HIGH]
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


## The locomotion cycle has to survive a round trip through the air.
func test_locomotion_resumes_but_one_shots_restart() -> void:
	assert_bool(Rig.STATES[&"move"][&"reset"]).is_false()
	for state in Rig.STATES:
		if state != &"move":
			assert_bool(Rig.STATES[state][&"reset"]) \
					.override_failure_message("'%s' should restart" % state).is_true()


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
