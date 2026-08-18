extends GdUnitTestSuite


const Rig := preload("res://src/characters/character_rig.gd")
const Codex := preload("res://src/ui/codex.gd")
const Entries := preload("res://src/ui/codex_entries.gd")


func _library_clips() -> Dictionary:
	var out := {}
	for path in Entries.ANIMATIONS:
		var inst: Node = load(path).instantiate()
		var player: AnimationPlayer = _find_player(inst)
		if player:
			var key: String = path.get_file().get_basename()
			for lib_name in player.get_animation_library_list():
				for clip in player.get_animation_library(lib_name).get_animation_list():
					out["%s/%s" % [key, clip]] = key
		inst.free()
	return out


func _find_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_player(child)
		if found:
			return found
	return null


func test_every_clip_the_rig_wires_up_exists() -> void:
	var available := _library_clips()
	assert_int(available.size()).is_greater(100)
	var usage: Dictionary = Rig.clip_usage()
	assert_int(usage.size()).is_greater(20)
	for clip in usage:
		assert_bool(available.has(clip)) \
				.override_failure_message("the rig wires up '%s', which no library carries" % clip) \
				.is_true()


func test_the_listing_covers_every_state_and_ring() -> void:
	var usage: Dictionary = Rig.clip_usage()
	for state in Rig.STATES:
		var clip: String = Rig.STATES[state].clip
		if clip == "":
			continue
		assert_bool(usage.has(clip)) \
				.override_failure_message("state '%s' plays '%s' unlisted" % [state, clip]).is_true()
	for named in [Rig.IDLE_CLIP, Rig.CROUCH_IDLE_CLIP, Rig.SHIELD_CLIP]:
		assert_bool(usage.has(named)) \
				.override_failure_message("'%s' is unlisted" % named).is_true()
	for ring in ["UAL2/Walk_Fwd", "UAL1/Jog_Fwd", "UAL1/Crouch_Fwd"]:
		assert_bool(usage.has(ring)) \
				.override_failure_message("'%s' is unlisted" % ring).is_true()


func test_clips_group_by_what_they_belong_to() -> void:
	assert_str(Codex._family_of("UAL1/Sword_Light_A")).is_equal("Sword")
	assert_str(Codex._family_of("UAL1/Crouch_Fwd_L")).is_equal("Crouch")
	assert_str(Codex._family_of("UAL1/Roll")).is_equal("Roll")
	assert_str(Codex._family_of("UAL2/BackFlip")).is_equal("BackFlip")
	assert_str(Codex._family_of("Dodge_Left")).is_equal("Dodge")


func test_the_wired_listing_is_a_shortlist() -> void:
	var usage: Dictionary = Rig.clip_usage()
	var available := _library_clips()
	assert_int(usage.size()).is_less(available.size())
	for clip in usage:
		assert_str(str(usage[clip])) \
				.override_failure_message("'%s' is listed with no reason" % clip).is_not_empty()


func test_the_codex_offers_the_clips_a_family_at_a_time() -> void:
	var codex: Node = Codex.new()
	add_child(codex)
	await get_tree().process_frame

	var families: Array = codex._families
	assert_int(families.size()).is_greater(5)
	assert_str(families[0]).is_equal(Codex.FAMILY_WIRED)
	assert_str(families[1]).is_equal(Codex.FAMILY_ALL)

	codex._pick_family(0)
	var wired: int = codex._clips.size()
	assert_int(wired).is_greater(20)
	for clip in codex._clips:
		assert_bool(codex._usage.has(clip)) \
				.override_failure_message("'%s' is not wired but listed as such" % clip).is_true()

	codex._pick_family(1)
	assert_int(codex._clips.size()).is_greater(wired)
	var crouch := families.find("Crouch")
	if crouch > 0:
		codex._pick_family(crouch)
		assert_int(codex._clips.size()).is_greater(0)
		for clip in codex._clips:
			assert_str(Codex._family_of(clip)).is_equal("Crouch")

	codex.queue_free()


func test_the_codex_crosses_between_states() -> void:
	var codex: Node = Codex.new()
	add_child(codex)
	await get_tree().process_frame
	assert_object(codex._rig).is_not_null()
	assert_object(codex._rig.tree).is_not_null()

	assert_int(codex._cross_states.size()).is_equal(Rig.STATES.size())

	var route := await _cross(codex, &"move", &"jump")
	assert_str(route[0]).is_equal("move")
	assert_str(route[-1]).is_equal("jump")
	assert_bool(codex._cross_faded) \
			.override_failure_message("move -> jump never blended, so it hard-cut; plan was %s"
				% str(codex._cross_plan)).is_true()

	var back := await _cross(codex, &"jump", &"move")
	assert_str(back[-1]).is_equal("move")
	assert_bool(codex._crossing).is_false()
	codex.queue_free()


func _cross(codex: Node, from: StringName, to: StringName) -> Array:
	codex._from_pick.selected = codex._cross_states.find(from)
	codex._to_pick.selected = codex._cross_states.find(to)
	codex._run_cross()
	assert_bool(codex._crossing).is_true()
	var guard := 0
	while codex._crossing and guard < 600:
		guard += 1
		await get_tree().process_frame
	assert_bool(codex._crossing) \
			.override_failure_message("crossing %s -> %s never settled" % [from, to]).is_false()
	return codex._cross_route


func test_every_state_can_be_crossed_into_from_move() -> void:
	var codex: Node = Codex.new()
	add_child(codex)
	await get_tree().process_frame

	var cut: Array = []
	var stranded: Array = []
	for state in codex._cross_states:
		if state == &"move":
			continue
		await _cross(codex, &"move", state)
		if codex._cross_route[-1] != String(state):
			stranded.append(String(state))
		elif not codex._cross_faded:
			cut.append(String(state))
	codex.queue_free()

	assert_array(stranded) \
			.override_failure_message("move never reaches: %s" % str(stranded)).is_empty()
	assert_array(cut) \
			.override_failure_message("move hard-cuts into: %s" % str(cut)).is_empty()
