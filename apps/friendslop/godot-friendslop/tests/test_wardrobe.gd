extends GdUnitTestSuite

## Clothing as something worn rather than something baked in.

const CharacterRig := preload("res://src/characters/character_rig.gd")

const BODY := "res://assets/characters/quaternius_ubc/models/Regular_Male_FullBody.glb"
const HEAD := "res://assets/characters/quaternius_ubc/models/Regular_Male_OnlyHead.glb"

const HOOD := &"male_ranger_head_hood"
const ARMET := &"male_knight_head_armet"
const RANGER := ["male_ranger_body", "male_ranger_arms", "male_ranger_legs",
		"male_ranger_feet_boots"]


func test_the_wardrobe_reads_the_whole_folder() -> void:
	var all := Wardrobe.all()
	assert_int(all.size()) \
			.override_failure_message("the wardrobe found %d pieces" % all.size()) \
			.is_greater_equal(64)


## The file name is the data, so a piece has to land in the slot its name says.
func test_a_piece_lands_in_the_slot_its_name_says() -> void:
	assert_str(Wardrobe.slot_of(HOOD)).is_equal("head")
	assert_str(Wardrobe.slot_of(&"male_ranger_body")).is_equal("chest")
	assert_str(Wardrobe.slot_of(&"male_ranger_legs")).is_equal("legs")
	assert_str(Wardrobe.slot_of(&"male_ranger_feet_boots")).is_equal("feet")
	assert_str(Wardrobe.slot_of(&"male_ranger_arms")).is_equal("hands")


## Pauldrons and a scarf are both called accessories and are not worn in the same place.
## Sharing one slot would mean a knight could not have both.
func test_a_scarf_and_a_pauldron_are_not_the_same_slot() -> void:
	assert_str(Wardrobe.slot_of(&"male_knight_acc_scarf")).is_equal("neck")
	assert_str(Wardrobe.slot_of(&"male_noble_acc_gorget")).is_equal("neck")
	assert_str(Wardrobe.slot_of(&"male_knight_acc_pauldron_round")).is_equal("back")


func test_an_outfit_gathers_its_own_pieces() -> void:
	var set_of := Wardrobe.outfit("Male", "Ranger")
	assert_int(set_of.size()).is_greater_equal(5)
	for id: StringName in set_of:
		assert_str(str(Wardrobe.piece(id)[&"outfit"])).is_equal("Ranger")
		assert_str(str(Wardrobe.piece(id)[&"sex"])).is_equal("Male")


func test_the_five_sets_are_all_there() -> void:
	for sex: String in ["Male", "Female"]:
		var names := Wardrobe.outfits(sex)
		for wanted: String in ["Knight", "Noble", "Peasant", "Ranger", "Wizard"]:
			assert_bool(names.has(wanted)) \
					.override_failure_message("no %s set for %s" % [wanted, sex]).is_true()


## A hood alone must not strip the body, or the character is a floating head in a hood.
func test_the_body_is_only_swapped_once_the_clothing_covers_it() -> void:
	assert_bool(Wardrobe.covers_the_body([&"head"])).is_false()
	assert_bool(Wardrobe.covers_the_body([&"chest", &"legs"])).is_false()
	assert_bool(Wardrobe.covers_the_body([&"chest", &"hands", &"legs", &"feet"])).is_true()


func test_putting_a_piece_on_adds_meshes_and_taking_it_off_removes_them() -> void:
	var rig := await _dressed([])
	var bare := _meshes(rig)

	assert_bool(rig.equip(HOOD)).is_true()
	assert_int(_meshes(rig)) \
			.override_failure_message("the hood went on and nothing was drawn") \
			.is_greater(bare)
	assert_str(rig.worn_in(&"head")).is_equal(HOOD)

	rig.unequip(&"head")
	await get_tree().process_frame
	assert_int(_meshes(rig)) \
			.override_failure_message("the hood came off and its meshes stayed") \
			.is_equal(bare)
	assert_str(rig.worn_in(&"head")).is_empty()


## One piece to a slot. An inventory that does not track what is already on would
## otherwise stack a helmet inside a hood.
func test_a_second_piece_in_one_slot_replaces_the_first() -> void:
	var rig := await _dressed([])
	rig.equip(HOOD)
	var with_hood := _meshes(rig)

	rig.equip(ARMET)
	await get_tree().process_frame
	assert_str(rig.worn_in(&"head")).is_equal(ARMET)
	assert_int(_meshes(rig)) \
			.override_failure_message("the helmet went on over the hood instead of replacing it") \
			.is_equal(with_hood)


func test_equipping_the_same_piece_twice_changes_nothing() -> void:
	var rig := await _dressed([])
	rig.equip(HOOD)
	var once := _meshes(rig)
	assert_bool(rig.equip(HOOD)).is_true()
	assert_int(_meshes(rig)).is_equal(once)


func test_a_piece_that_is_not_in_the_wardrobe_is_refused() -> void:
	var rig := await _dressed([])
	assert_bool(rig.equip(&"male_wizard_head_sombrero")).is_false()


## The reason head_only_body exists: worn from the start, a full outfit has to take the
## body with it or the bare torso shows through the cloth.
func test_a_fully_dressed_character_is_built_on_a_bare_head() -> void:
	assert_object(_base_for(RANGER)) \
			.override_failure_message("a fully dressed character kept its whole body underneath") \
			.is_same(load(HEAD))


## The other half of the same rule: anything short of a full outfit keeps its body, or a
## hood on its own leaves a head floating in it.
func test_a_partly_dressed_character_keeps_its_body() -> void:
	assert_object(_base_for([HOOD])).is_same(load(BODY))
	assert_object(_base_for([])).is_same(load(BODY))
	assert_object(_base_for(["male_ranger_body", "male_ranger_legs"])).is_same(load(BODY))


## A character with no bare-head body to fall back on wears its outfit over its body
## rather than being built out of nothing.
func test_without_a_bare_head_body_the_full_body_is_kept() -> void:
	var rig := CharacterRig.new()
	auto_free(rig)
	rig.body = load(BODY)
	rig.worn = _ids(RANGER)
	assert_object(rig._base_body()).is_same(load(BODY))


## What the player has on is kept where everything else the world remembers is kept, so it
## is still on after quitting.
func test_what_the_player_wears_survives_a_restart() -> void:
	var was := Journal.wearing()
	Journal.forget_everything()

	Journal.wear(HOOD)
	assert_str(Journal.worn_in(&"head")).is_equal(HOOD)
	Journal.load_now()
	assert_str(Journal.worn_in(&"head")) \
			.override_failure_message("the hood came off overnight").is_equal(HOOD)

	Journal.take_off(&"head")
	Journal.load_now()
	assert_str(Journal.worn_in(&"head")) \
			.override_failure_message("taking the hood off did not stick").is_empty()

	Journal.forget_everything()
	for slot: Variant in was:
		Journal.wear(StringName(was[slot]))


## A save naming a piece that is no longer in the folder must not come back as a warning
## every time the player is built.
func test_a_saved_piece_that_no_longer_exists_is_dropped() -> void:
	var was := Journal.wearing()
	Journal.forget_everything()

	Journal._worn[&"head"] = &"male_wizard_head_sombrero"
	Journal.save_now()
	Journal.load_now()
	assert_str(Journal.worn_in(&"head")) \
			.override_failure_message("a piece that is not in the wardrobe was loaded anyway") \
			.is_empty()

	Journal.forget_everything()
	for slot: Variant in was:
		Journal.wear(StringName(was[slot]))


## A rig following the wardrobe wears what it says and nothing else -- a slot emptied in
## the wardrobe has to come off the body too.
func test_a_following_rig_wears_exactly_what_the_wardrobe_says() -> void:
	var rig := await _dressed([])
	rig.wear_set({&"head": HOOD})
	assert_str(rig.worn_in(&"head")).is_equal(HOOD)

	rig.wear_set({})
	await get_tree().process_frame
	assert_str(rig.worn_in(&"head")) \
			.override_failure_message("the wardrobe was emptied and the hood stayed on") \
			.is_empty()


## Putting the last piece of an outfit on crosses the line between half-dressed and
## dressed, and the body underneath has to go with it.
func test_completing_an_outfit_swaps_the_body_underneath() -> void:
	var rig := await _dressed([])
	assert_object(rig._built_base).is_same(load(BODY))

	var whole := {}
	for id: Variant in RANGER:
		whole[Wardrobe.slot_of(StringName(id))] = id
	rig.wear_set(whole)
	await get_tree().process_frame

	assert_object(rig._built_base) \
			.override_failure_message("the outfit went on over the whole body") \
			.is_same(load(HEAD))
	assert_int(rig.wearing().size()) \
			.override_failure_message("rebuilding lost the clothes it rebuilt for") \
			.is_equal(RANGER.size())


## Every row of the wardrobe page names a slot, and a missing key shows the player the key
## itself rather than a word.
## Cel shading is keyed by material name, and a material with no entry is left drawn the
## way it was imported -- so a hood would be the one lit thing on a drawn character.
func test_every_material_the_clothing_uses_is_shaded() -> void:
	var wanted := {}
	for id: StringName in Wardrobe.all():
		var scene: PackedScene = load(Wardrobe.path_of(id))
		var instance: Node = scene.instantiate()
		auto_free(instance)
		for mesh: MeshInstance3D in _mesh_nodes(instance):
			for i in mesh.mesh.get_surface_count():
				var mat := mesh.mesh.surface_get_material(i)
				if mat:
					wanted[mat.resource_name] = id
	for name: String in wanted:
		assert_bool(CharacterRig.SHADING.has(StringName(name))) \
				.override_failure_message("%s (worn by %s) has no shading entry" % [
						name, wanted[name]]) \
				.is_true()


func _mesh_nodes(node: Node) -> Array:
	var out := []
	if node is MeshInstance3D and (node as MeshInstance3D).mesh:
		out.append(node)
	for child in node.get_children():
		out.append_array(_mesh_nodes(child))
	return out


func test_the_wardrobe_page_has_a_word_for_every_slot() -> void:
	var keys := ["wardrobe.title", "wardrobe.none", "wardrobe.head", "wardrobe.chest",
			"wardrobe.hands", "wardrobe.legs", "wardrobe.feet", "wardrobe.neck",
			"wardrobe.back"]
	for key: String in keys:
		assert_str(I18n.t(key)) \
				.override_failure_message("nothing in the locale for '%s'" % key) \
				.is_not_equal(key)


func _base_for(pieces: Array) -> PackedScene:
	var rig := CharacterRig.new()
	auto_free(rig)
	rig.body = load(BODY)
	rig.head_only_body = load(HEAD)
	rig.worn = _ids(pieces)
	return rig._base_body()


func _ids(pieces: Array) -> Array[StringName]:
	var out: Array[StringName] = []
	for p: Variant in pieces:
		out.append(StringName(p))
	return out


func _dressed(pieces: Array) -> Node3D:
	var rig := CharacterRig.new()
	rig.body = load(BODY)
	rig.head_only_body = load(HEAD)
	rig.worn = _ids(pieces)
	add_child(rig)
	auto_free(rig)
	await get_tree().process_frame
	return rig


func _meshes(node: Node) -> int:
	var count := 1 if node is MeshInstance3D and not node.is_queued_for_deletion() else 0
	for child in node.get_children():
		count += _meshes(child)
	return count
