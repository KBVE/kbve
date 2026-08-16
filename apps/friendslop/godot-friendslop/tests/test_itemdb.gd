extends GdUnitTestSuite

## The item catalog, and the link between an item and what wearing it looks like.

const HOOD := &"ranger-hood"
const SHIRT := &"peasant-shirt"


func test_the_catalog_loads() -> void:
	assert_int(Itemdb.all().size()) \
			.override_failure_message("no items were read out of the mirrored catalog") \
			.is_greater(100)


func test_a_worn_item_knows_where_it_goes() -> void:
	assert_str(Itemdb.slot_of(HOOD)).is_equal("head")
	assert_str(Itemdb.slot_of(SHIRT)).is_equal("chest")


## The catalog names a look without a sex, because the same hood is a different mesh on a
## different frame. Resolving it is what turns an item into something to draw.
func test_an_item_resolves_to_a_piece_of_the_wardrobe() -> void:
	assert_str(Itemdb.wardrobe_piece(HOOD, "Male")).is_equal("male_ranger_head_hood")
	assert_str(Itemdb.wardrobe_piece(HOOD, "Female")).is_equal("female_ranger_head_hood")


## An item that is not clothing has no look, and asking for one must not invent a piece.
func test_an_item_that_is_not_worn_has_no_look() -> void:
	assert_str(Itemdb.wardrobe_piece(&"arrow")).is_empty()
	assert_str(Itemdb.wardrobe_piece(&"not-a-real-item")).is_empty()


## Every wearable the catalog offers has to resolve to a mesh that is actually there, or
## the wardrobe lists a thing the player cannot put on.
func test_every_wearable_item_resolves_to_a_real_piece() -> void:
	var wearables := Itemdb.wearables()
	assert_int(wearables.size()) \
			.override_failure_message("the catalog has nothing that can be worn") \
			.is_greater_equal(10)
	for ref: StringName in wearables:
		for sex: String in ["Male", "Female"]:
			var piece := Itemdb.wardrobe_piece(ref, sex)
			assert_str(piece) \
					.override_failure_message("%s has no %s mesh in the wardrobe" % [ref, sex]) \
					.is_not_empty()
			assert_str(Wardrobe.slot_of(piece)) \
					.override_failure_message("%s says %s, its mesh says %s" % [
							ref, Itemdb.slot_of(ref), Wardrobe.slot_of(piece)]) \
					.is_equal(Itemdb.slot_of(ref))


## The pack does not name its two halves alike: his boots are `Feet_Boots` and hers are
## plain `Feet`, his shoulder `Acc_Pauldron` to her `Acc_Pauldrons`. One item names one
## look for everybody, so the lookup has to land on both.
func test_an_item_lands_on_both_bodies_despite_the_pack_naming_them_differently() -> void:
	assert_str(Itemdb.wardrobe_piece(&"ranger-boots", "Male")).is_equal("male_ranger_feet_boots")
	assert_str(Itemdb.wardrobe_piece(&"ranger-boots", "Female")) \
			.override_failure_message("her boots are named differently and were not found") \
			.is_equal("female_ranger_feet")
	assert_str(Itemdb.wardrobe_piece(&"ranger-mantle", "Female")) \
			.override_failure_message("her pauldrons are plural and were not found") \
			.is_equal("female_ranger_acc_pauldrons")


## The item decides the slot, so nothing handing one out has to know where it goes.
func test_wearing_an_item_puts_it_in_the_right_slot() -> void:
	var was := Journal.wearing()
	Journal.forget_everything()

	assert_bool(Journal.wear_item(HOOD)).is_true()
	assert_str(Journal.worn_in(&"head")).is_equal("male_ranger_head_hood")

	assert_bool(Journal.wear_item(&"arrow")) \
			.override_failure_message("an arrow was worn on the body") \
			.is_false()

	Journal.forget_everything()
	for slot: Variant in was:
		Journal.wear(StringName(was[slot]))


## What the player has on is saved as the mesh, and the catalog is what turns an item into
## one -- so an item worn now is still on after a restart.
func test_an_item_worn_now_is_still_on_after_a_restart() -> void:
	var was := Journal.wearing()
	Journal.forget_everything()

	Journal.wear_item(SHIRT)
	Journal.load_now()
	assert_str(Journal.worn_in(&"chest")) \
			.override_failure_message("the shirt came off overnight") \
			.is_equal("male_peasant_body")

	Journal.forget_everything()
	for slot: Variant in was:
		Journal.wear(StringName(was[slot]))
