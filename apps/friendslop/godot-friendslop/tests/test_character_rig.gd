extends GdUnitTestSuite

const Rig := preload("res://src/characters/character_rig.gd")


func _links() -> Array:
	return Rig.JUMP_CHAIN + Rig.CLIMB_CHAIN


## A state named in a transition but missing from STATES takes the tree build down
## with it, since the build reads reset off the entry.
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
		assert_float(cfg[&"ik"]).is_between(0.0, 1.0)


## The locomotion cycle has to survive a round trip through the air. Resetting it
## restarts the blend space at frame 0, which cuts the legs out of mid-stride.
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
	# Landing: the legs are handed back over the fade rather than at one edge of it.
	assert_float(rig.ground_weight_for(&"move", &"jump_land", 0.0)).is_equal_approx(0.7, 0.001)
	assert_float(rig.ground_weight_for(&"move", &"jump_land", 0.5)).is_equal_approx(0.85, 0.001)
	assert_float(rig.ground_weight_for(&"move", &"jump_land", 1.0)).is_equal_approx(1.0, 0.001)
	# Take-off runs the other way, down to nothing in the air.
	assert_float(rig.ground_weight_for(&"jump", &"jump_start", 0.5)).is_equal_approx(0.2, 0.001)
	# Nothing fading is the settled state, and past the ends it holds.
	assert_float(rig.ground_weight_for(&"move", &"", 0.0)).is_equal(1.0)
	assert_float(rig.ground_weight_for(&"move", &"jump_land", 4.0)).is_equal(1.0)
	assert_float(rig.ground_weight_for(&"move", &"jump_land", -4.0)).is_equal_approx(0.7, 0.001)
	# An unknown state must not silently unplant the feet.
	assert_float(rig.ground_weight_for(&"nonexistent", &"", 0.0)).is_equal(1.0)
	rig.free()
