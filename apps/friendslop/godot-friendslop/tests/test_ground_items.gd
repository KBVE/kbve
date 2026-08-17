extends GdUnitTestSuite


const Field := preload("res://src/world/ground_items.gd")

var _was: Dictionary = {}
var _root: Node3D
var _player: Node3D
var _field: GroundItems


func before_test() -> void:
	_was = Journal.satchel()
	Journal.forget_everything()
	_root = Node3D.new()
	add_child(_root)
	auto_free(_root)
	_player = Node3D.new()
	_player.name = "Player"
	_root.add_child(_player)
	_field = Field.new()
	_field.player_path = NodePath("../Player")
	_root.add_child(_field)


func after_test() -> void:
	Journal.forget_everything()
	for ref: StringName in _was:
		Journal.gain(ref, int(_was[ref]))
	Journal.save_now()


func _stand_off() -> void:
	_player.global_position = Vector3(100.0, 0.0, 100.0)


func _stand_on(item: GroundItem) -> void:
	_player.global_position = item.global_position


func test_a_drop_lands_where_it_was_dropped() -> void:
	_stand_off()
	var item := _field.drop(&"log", 3, Vector3(4.0, 1.0, -2.0))

	assert_object(item).is_not_null()
	assert_int(item.count).is_equal(3)
	assert_float(item.global_position.distance_to(Vector3(4.0, 1.0, -2.0))) \
			.override_failure_message("the drop landed somewhere other than the feet it fell from") \
			.is_less(1.0)


func test_an_item_nobody_has_heard_of_is_not_dropped() -> void:
	assert_object(_field.drop(&"unobtainium", 1, Vector3.ZERO)).is_null()
	assert_int(_field.items().size()).is_equal(0)


func test_walking_over_a_drop_picks_it_up() -> void:
	_stand_off()
	var item := _field.drop(&"log", 3, Vector3(4.0, 0.0, 0.0))
	_field._process(0.016)
	assert_int(Journal.count_of(&"log")) \
			.override_failure_message("a drop across the clearing walked into the bag on its own") \
			.is_equal(0)

	_stand_on(item)
	_field._process(0.016)

	assert_int(Journal.count_of(&"log")).is_equal(3)
	assert_int(_field.items().size()) \
			.override_failure_message("the drop was taken and the plate stayed on the ground") \
			.is_equal(0)


func test_a_bag_with_partial_room_takes_what_fits() -> void:
	var cap := Itemdb.max_stack(&"log")
	var cells := Journal.COLS * Journal.ROWS
	Journal.gain(&"log", cap * cells - 2)
	_stand_off()
	var item := _field.drop(&"log", 5, Vector3(4.0, 0.0, 0.0))
	_stand_on(item)
	_field._process(0.016)

	assert_int(Journal.count_of(&"log")).is_equal(cap * cells)
	assert_int(item.count) \
			.override_failure_message("the pile forgot what was left in it").is_equal(3)


func test_a_refused_drop_is_not_retried_every_frame() -> void:
	var cap := Itemdb.max_stack(&"log")
	var cells := Journal.COLS * Journal.ROWS
	Journal.gain(&"log", cap * cells)
	_stand_off()
	var item := _field.drop(&"log", 2, Vector3(4.0, 0.0, 0.0))
	_stand_on(item)

	var refusals: Array = []
	var listener := func(_ref: StringName, _count: int) -> void: refusals.append(1)
	Journal.refused.connect(listener)
	for i in 30:
		_field._process(0.016)

	assert_int(refusals.size()) \
			.override_failure_message("a full bag was asked about the same drop every frame") \
			.is_equal(1)
	assert_int(_field.items().size()).is_equal(1)

	for i in 120:
		_field._process(0.016)
	Journal.refused.disconnect(listener)
	assert_int(refusals.size()) \
			.override_failure_message("a drop was refused once and then never looked at again") \
			.is_greater(1)


func test_a_drop_nobody_came_back_for_goes_away() -> void:
	_stand_off()
	_field.despawn_seconds = 1.0
	_field.drop(&"log", 1, Vector3(4.0, 0.0, 0.0))

	_field._process(0.5)
	assert_int(_field.items().size()).is_equal(1)
	_field._process(0.6)
	assert_int(_field.items().size()) \
			.override_failure_message("drops pile up on the ground for ever").is_equal(0)


func test_the_ground_holds_only_so_many() -> void:
	_stand_off()
	_field.max_items = 3
	for i in 6:
		_field.drop(&"log", i + 1, Vector3(4.0, 0.0, 0.0))

	assert_int(_field.items().size()).is_equal(3)
	assert_int(_field.items()[0].count) \
			.override_failure_message("the newest drop was thrown away instead of the oldest") \
			.is_equal(4)


func test_the_field_can_be_found_from_the_tree() -> void:
	assert_object(GroundItems.of(get_tree())).is_same(_field)


## Something the player put down lands at their feet, inside the radius that picks
## things up. Without the disarm it would be back in the bag the same frame.
func test_a_dropped_stack_is_not_picked_straight_back_up() -> void:
	_player.global_position = Vector3(4.0, 0.0, 0.0)
	var item := _field.drop_at_player(&"log", 3)

	assert_object(item).is_not_null()
	assert_bool(item.armed).is_false()
	for i in 30:
		_field._process(0.016)

	assert_int(Journal.count_of(&"log")) \
			.override_failure_message("a stack dropped at the player's feet was vacuumed back in") \
			.is_equal(0)
	assert_int(_field.items().size()).is_equal(1)


## Once the player has walked off it, it is an ordinary drop again.
func test_walking_away_arms_a_dropped_stack() -> void:
	_player.global_position = Vector3(4.0, 0.0, 0.0)
	var item := _field.drop_at_player(&"log", 3)

	_stand_off()
	_field._process(0.016)
	assert_bool(item.armed) \
			.override_failure_message("stepping off a drop left it inert").is_true()
	assert_int(Journal.count_of(&"log")).is_equal(0)

	_stand_on(item)
	_field._process(0.016)
	assert_int(Journal.count_of(&"log")).is_equal(3)


func test_a_drop_is_armed_by_default() -> void:
	_stand_off()
	assert_bool(_field.drop(&"log", 1, Vector3(4.0, 0.0, 0.0)).armed).is_true()
