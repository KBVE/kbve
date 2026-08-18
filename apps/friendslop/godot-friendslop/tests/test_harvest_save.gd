extends GdUnitTestSuite

## The player's marks on the world, round-tripped through the save file the
## solo world writes. The fields are gdext nodes that need no scene for their
## ledger alone, which is what makes this provable headless.


func _tree_field() -> Node:
	var field: Node = ClassDB.instantiate(&"QTreeField")
	auto_free(field)
	return field


func test_an_untouched_world_exports_a_header_alone() -> void:
	var field := _tree_field()
	var bytes: PackedByteArray = field.export_harvest()
	assert_int(bytes.size()).is_equal(8)


func test_a_save_round_trips_between_fields() -> void:
	var a := _tree_field()
	var bytes: PackedByteArray = a.export_harvest()
	var b := _tree_field()
	assert_bool(b.import_harvest(bytes)).is_true()
	assert_that(b.export_harvest()).is_equal(bytes)


func test_garbage_is_refused_and_changes_nothing() -> void:
	var field := _tree_field()
	var before: PackedByteArray = field.export_harvest()
	assert_bool(field.import_harvest("not a save".to_utf8_buffer())).is_false()
	assert_that(field.export_harvest()).is_equal(before)


func test_a_save_from_another_seed_is_refused() -> void:
	var a := _tree_field()
	a.tree_seed = 42
	var foreign: PackedByteArray = a.export_harvest()
	var b := _tree_field()
	assert_bool(b.import_harvest(foreign)).is_false()


func test_stones_speak_the_same_format_but_not_the_same_world() -> void:
	var stones: Node = ClassDB.instantiate(&"QStoneField")
	auto_free(stones)
	var bytes: PackedByteArray = stones.export_harvest()
	assert_int(bytes.size()).is_equal(8)
	var trees := _tree_field()
	trees.tree_seed = stones.stone_seed
	assert_bool(trees.import_harvest(bytes)).is_true()
