extends GdUnitTestSuite

const Rig := preload("res://src/characters/creature_rig.gd")
const MECHS := ["George", "Leela", "Mike", "Stan"]


func _clips(mech: String) -> PackedStringArray:
	var scene: PackedScene = load("res://assets/characters/creatures/mech/models/%s.glb" % mech)
	assert_object(scene).override_failure_message("%s.glb missing" % mech).is_not_null()
	var inst := scene.instantiate()
	var player := _find_player(inst)
	assert_object(player).override_failure_message("%s has no AnimationPlayer" % mech).is_not_null()
	var names := player.get_animation_list()
	inst.free()
	return names


func _find_player(n: Node) -> AnimationPlayer:
	if n is AnimationPlayer:
		return n
	for c in n.get_children():
		var found := _find_player(c)
		if found:
			return found
	return null


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var found := _find_skeleton(c)
		if found:
			return found
	return null


func test_states_are_fully_specified() -> void:
	for state in Rig.STATES:
		var cfg: Dictionary = Rig.STATES[state]
		for key in [&"clip", &"loop", &"xfade", &"reset", &"returns_to_move", &"ik"]:
			assert_bool(cfg.has(key)) \
					.override_failure_message("'%s' missing %s" % [state, key]).is_true()
		assert_float(cfg[&"xfade"]).is_between(0.0, 1.0)
	assert_str(Rig.STATES[&"move"][&"clip"]).is_empty()


## Every clip the rig names has to exist in the pack, or the state is added to the
## machine as a null node.
func test_every_named_clip_exists_in_every_mech() -> void:
	var wanted: Array[String] = []
	wanted.append_array(Rig.MOVE_CLIPS)
	for state in Rig.STATES:
		var clip: String = Rig.STATES[state][&"clip"]
		if clip != "":
			wanted.append(clip)
	for mech in MECHS:
		var have := _clips(mech)
		for clip in wanted:
			assert_bool(clip in have) \
					.override_failure_message("%s has no clip '%s'" % [mech, clip]).is_true()


## The pack imports every clip as LOOP_NONE, cycles included, so the rig has to mark
## them or Idle plays once and holds its last frame forever.
func test_locomotion_clips_import_unlooped() -> void:
	var scene: PackedScene = load("res://assets/characters/creatures/mech/models/George.glb")
	var inst := scene.instantiate()
	var player := _find_player(inst)
	for clip in Rig.MOVE_CLIPS:
		var anim: Animation = player.get_animation(clip)
		assert_int(anim.loop_mode) \
				.override_failure_message("'%s' now imports looped; _mark_loops may be dead code" % clip) \
				.is_equal(Animation.LOOP_NONE)
	inst.free()


func test_attacks_are_one_shots_that_return() -> void:
	for attack in Rig.ATTACKS:
		assert_bool(Rig.STATES.has(attack)) \
				.override_failure_message("attack '%s' has no state" % attack).is_true()
		assert_bool(Rig.STATES[attack][&"returns_to_move"]) \
				.override_failure_message("attack '%s' never returns" % attack).is_true()
		assert_bool(Rig.STATES[attack][&"loop"]) \
				.override_failure_message("attack '%s' should not loop" % attack).is_false()


## Death is the one state that keeps the body, so a corpse does not stand back up.
func test_death_does_not_return_to_move() -> void:
	assert_bool(Rig.STATES[&"death"][&"returns_to_move"]).is_false()
	assert_bool(Rig.STATES[&"death"][&"loop"]).is_false()


## Airborne and dead states hand the legs back to the animation.
func test_offground_states_release_the_foot_solver() -> void:
	for state in [&"jump", &"death"]:
		assert_float(Rig.STATES[state][&"ik"]) \
				.override_failure_message("'%s' still plants the feet" % state).is_equal(0.0)
	assert_float(Rig.STATES[&"move"][&"ik"]).is_equal(1.0)


func test_ground_weight_blends_across_a_crossfade() -> void:
	var rig := Rig.new()
	assert_float(rig.ground_weight_for(&"jump", &"move", 0.0)).is_equal_approx(1.0, 0.001)
	assert_float(rig.ground_weight_for(&"jump", &"move", 0.5)).is_equal_approx(0.5, 0.001)
	assert_float(rig.ground_weight_for(&"jump", &"move", 1.0)).is_equal_approx(0.0, 0.001)
	assert_float(rig.ground_weight_for(&"move", &"", 1.0)).is_equal_approx(1.0, 0.001)
	rig.free()


## The pack exports every mech facing +Z, which is why the rig turns them 180 degrees.
## Godot's forward is -Z, and a body facing +Z carries its left side on +X.
func test_every_mech_exports_facing_positive_z() -> void:
	var rig := Rig.new()
	assert_float(rig.facing_offset_deg).is_equal(180.0)
	rig.free()
	for mech in MECHS:
		var inst := _instance(mech)
		var skeleton := _find_skeleton(inst)
		var left := skeleton.find_bone("Foot.L")
		var right := skeleton.find_bone("Foot.R")
		assert_int(left).override_failure_message("%s has no Foot.L" % mech).is_greater(-1)
		assert_float(skeleton.get_bone_global_rest(left).origin.x) \
				.override_failure_message("%s: Foot.L is not on +X, so it faces -Z" % mech) \
				.is_greater(0.0)
		assert_float(skeleton.get_bone_global_rest(right).origin.x).is_less(0.0)
		inst.free()


## The foot solver assumes this rig shape: a two- or three-bone chain down to the shin,
## with the foot hung off the armature root as a control the chain does not carry.
func test_every_mech_has_a_solvable_leg() -> void:
	for mech in MECHS:
		var inst := _instance(mech)
		var skeleton := _find_skeleton(inst)
		for side in ["L", "R"]:
			var chain: Array[int] = []
			for part in ["UpperLeg", "MidLeg", "LowerLeg"]:
				var bone := skeleton.find_bone("%s.%s" % [part, side])
				if bone >= 0:
					chain.append(bone)
			assert_int(chain.size()) \
					.override_failure_message("%s.%s has no leg chain" % [mech, side]) \
					.is_greater(1)
			var foot := skeleton.find_bone("Foot.%s" % side)
			assert_int(foot) \
					.override_failure_message("%s has no Foot.%s" % [mech, side]).is_greater(-1)
			var walk := skeleton.get_bone_parent(foot)
			while walk >= 0:
				assert_bool(walk in chain) \
						.override_failure_message("%s: Foot.%s now hangs off the leg chain, so the solver would move it twice" % [mech, side]) \
						.is_false()
				walk = skeleton.get_bone_parent(walk)
		inst.free()


func _instance(mech: String) -> Node:
	var scene: PackedScene = load("res://assets/characters/creatures/mech/models/%s.glb" % mech)
	var inst := scene.instantiate()
	assert_object(_find_skeleton(inst)) \
			.override_failure_message("%s has no Skeleton3D" % mech).is_not_null()
	return inst


func test_shading_covers_every_mech_material() -> void:
	for mech in MECHS:
		assert_bool(Rig.SHADING.has(StringName("%s_Texture" % mech))) \
				.override_failure_message("no shading entry for %s_Texture" % mech).is_true()


## `travel` will not path through a disabled transition, and with no route to the state it
## was asked for the playback hard-cuts to it instead of cross-fading -- which makes every
## xfade on these links dead weight. play_action travels into each of these states, so all
## of them have to be reachable by hand.
func test_no_transition_is_closed_to_travel() -> void:
	var rig: Node = auto_free(Rig.new())
	var machine := AnimationNodeStateMachine.new()
	machine.add_node("move", AnimationNodeAnimation.new())
	for state in Rig.STATES:
		if state != &"move":
			machine.add_node(state, AnimationNodeAnimation.new())
	for state in Rig.STATES:
		if state == &"move":
			continue
		rig._link(machine, &"move", state, false)
		if Rig.STATES[state].returns_to_move:
			rig._link(machine, state, &"move", true)

	var checked := 0
	for i in machine.get_transition_count():
		if machine.get_transition_from(i) != &"move":
			continue
		var into := machine.get_transition(i)
		var to := machine.get_transition_to(i)
		checked += 1
		assert_int(into.advance_mode) \
				.override_failure_message("move -> %s is closed to travel, so it hard-cuts" % to) \
				.is_not_equal(AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED)
		assert_float(into.xfade_time) \
				.override_failure_message("move -> %s cuts" % to).is_greater(0.0)
	assert_int(checked).is_equal(Rig.STATES.size() - 1)
