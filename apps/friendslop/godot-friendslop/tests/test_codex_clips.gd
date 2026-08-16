extends GdUnitTestSuite

## The Codex is where the kit's animation is actually looked at, so what it claims about
## a clip has to keep up with what the rig does with one.

const Rig := preload("res://src/characters/character_rig.gd")
const Codex := preload("res://src/ui/codex.gd")
const Entries := preload("res://src/ui/codex_entries.gd")


## Clip name to the library it came out of, taken the way the rig takes it: one
## instantiate of the glbs, no body and no materials, so this stays cheap and headless.
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


## A clip the rig names but the libraries do not carry is a hole in the blend space that
## shows up as the character sliding in its neighbour's pose. The Codex is the one place
## that would list it, so it is the right place to catch it.
func test_every_clip_the_rig_wires_up_exists() -> void:
	var available := _library_clips()
	assert_int(available.size()).is_greater(100)
	var usage: Dictionary = Rig.clip_usage()
	assert_int(usage.size()).is_greater(20)
	for clip in usage:
		assert_bool(available.has(clip)) \
				.override_failure_message("the rig wires up '%s', which no library carries" % clip) \
				.is_true()


## Every state that names a clip has to be listed, or the museum would show it as unused
## while the game plays it.
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
	## The rings are named by prefix rather than one at a time, so a sample of each.
	for ring in ["UAL2/Walk_Fwd", "UAL1/Jog_Fwd", "UAL1/Crouch_Fwd"]:
		assert_bool(usage.has(ring)) \
				.override_failure_message("'%s' is unlisted" % ring).is_true()


## The kit names a clip for what it belongs to before saying which one it is, which is
## the only thing making a few hundred of them browsable.
func test_clips_group_by_what_they_belong_to() -> void:
	assert_str(Codex._family_of("UAL1/Sword_Light_A")).is_equal("Sword")
	assert_str(Codex._family_of("UAL1/Crouch_Fwd_L")).is_equal("Crouch")
	assert_str(Codex._family_of("UAL1/Roll")).is_equal("Roll")
	assert_str(Codex._family_of("UAL2/BackFlip")).is_equal("BackFlip")
	assert_str(Codex._family_of("Dodge_Left")).is_equal("Dodge")


## The wired listing has to be a real shortlist: the whole point is telling the few dozen
## the game leans on apart from the several hundred the kit ships.
func test_the_wired_listing_is_a_shortlist() -> void:
	var usage: Dictionary = Rig.clip_usage()
	var available := _library_clips()
	assert_int(usage.size()).is_less(available.size())
	for clip in usage:
		assert_str(str(usage[clip])) \
				.override_failure_message("'%s' is listed with no reason" % clip).is_not_empty()


## The listing is only worth anything if it actually reaches the Codex, so this drives
## the real control: build it, let it load its first subject, and read the pickers back.
func test_the_codex_offers_the_clips_a_family_at_a_time() -> void:
	var codex: Node = Codex.new()
	add_child(codex)
	await get_tree().process_frame

	var families: Array = codex._families
	assert_int(families.size()).is_greater(5)
	assert_str(families[0]).is_equal(Codex.FAMILY_WIRED)
	assert_str(families[1]).is_equal(Codex.FAMILY_ALL)

	## The wired family is the shortlist, and it is what the Codex opens on.
	codex._pick_family(0)
	var wired: int = codex._clips.size()
	assert_int(wired).is_greater(20)
	for clip in codex._clips:
		assert_bool(codex._usage.has(clip)) \
				.override_failure_message("'%s' is not wired but listed as such" % clip).is_true()

	## Everything is a strict superset of it, and a named family a strict subset.
	codex._pick_family(1)
	assert_int(codex._clips.size()).is_greater(wired)
	var crouch := families.find("Crouch")
	if crouch > 0:
		codex._pick_family(crouch)
		assert_int(codex._clips.size()).is_greater(0)
		for clip in codex._clips:
			assert_str(Codex._family_of(clip)).is_equal("Crouch")

	codex.queue_free()
