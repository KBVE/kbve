extends GdUnitTestSuite

## The bag as the player handles it: opening it, and dragging things around inside it.

const Bag := preload("res://src/ui/satchel_panel.gd")
const Field := preload("res://src/world/ground_items.gd")

var _was: Dictionary = {}
var _panel: CanvasLayer
var _root: Node3D
var _player: Node3D


func before_test() -> void:
	_was = Journal.satchel()
	Journal.forget_everything()
	_panel = CanvasLayer.new()
	_panel.set_script(Bag)
	add_child(_panel)
	auto_free(_panel)


## The floor the bag throws things onto. Made on demand, because one of these tests is
## about what happens when there is nowhere to throw them.
func _give_it_a_floor() -> GroundItems:
	_root = Node3D.new()
	add_child(_root)
	auto_free(_root)
	_player = Node3D.new()
	_player.name = "Player"
	_root.add_child(_player)
	var field := Field.new()
	field.player_path = NodePath("../Player")
	_root.add_child(field)
	return field


func after_test() -> void:
	Journal.forget_everything()
	for ref: StringName in _was:
		Journal.gain(ref, int(_was[ref]))
	Journal.save_now()


## Opening the bag has to free the cursor, or there is no way to drag anything in it.
func test_opening_the_bag_frees_the_mouse() -> void:
	_panel._open()

	assert_bool(_panel.visible).is_true()
	assert_int(Input.mouse_mode) \
			.override_failure_message("the bag opened with the cursor still locked to the camera") \
			.is_equal(Input.MOUSE_MODE_VISIBLE)

	_panel._close()
	assert_bool(_panel.visible).is_false()


## Handing a captured mouse back on close is deliberately not tested: headless has no
## window to capture into, so MOUSE_MODE_CAPTURED never takes and the assertion would be
## measuring the environment rather than the panel. The half that can be checked is
## below -- a cursor that was already free stays free.


## A bag opened from a menu that already had the cursor free must not steal it into the
## camera on the way out.
func test_closing_does_not_capture_a_mouse_that_was_already_free() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_panel._open()
	_panel._close()
	assert_int(Input.mouse_mode).is_equal(Input.MOUSE_MODE_VISIBLE)


## The cell under the cursor is what everything else is built on.
func test_the_cursor_finds_the_cell_it_is_over() -> void:
	_panel._open()
	var origin: Vector2 = _panel._origin()
	var step: float = Bag.CELL + Bag.GAP

	assert_vector(_panel._cell_under(origin + Vector2(4.0, 4.0))).is_equal(Vector2i(0, 0))
	assert_vector(_panel._cell_under(origin + Vector2(step * 3.0 + 4.0, step * 2.0 + 4.0))) \
			.is_equal(Vector2i(3, 2))
	assert_vector(_panel._cell_under(origin - Vector2(40.0, 40.0))) \
			.override_failure_message("a cursor off the board was read as being on it") \
			.is_equal(Vector2i(-1, -1))


func test_a_stack_is_found_under_its_own_cell() -> void:
	Journal.gain(&"log", 2)
	var stack: Dictionary = Journal.stacks()[0]
	var at := Vector2i(int(stack["x"]), int(stack["y"]))

	assert_int(_panel._stack_at(at)).is_equal(0)
	assert_int(_panel._stack_at(Vector2i(Journal.COLS - 1, Journal.ROWS - 1))) \
			.override_failure_message("an empty cell reported a stack in it").is_equal(-1)


## The whole point of the panel: pick a stack up in one cell and put it down in another.
func test_dragging_a_stack_moves_it() -> void:
	Journal.gain(&"log", 2)
	_panel._open()
	var step: float = Bag.CELL + Bag.GAP
	var origin: Vector2 = _panel._origin()
	var start: Dictionary = Journal.stacks()[0]

	_panel._mouse = origin + Vector2(int(start["x"]) * step + 4.0, int(start["y"]) * step + 4.0)
	_panel._pick_up()
	assert_int(_panel._held).is_equal(0)

	_panel._mouse = origin + Vector2(5.0 * step + 4.0, 3.0 * step + 4.0)
	_panel._put_down()

	var moved: Dictionary = Journal.stacks()[0]
	assert_int(int(moved["x"])).is_equal(5)
	assert_int(int(moved["y"])).is_equal(3)
	assert_int(_panel._held) \
			.override_failure_message("the stack was still stuck to the cursor").is_equal(-1)


## A stack dropped where it cannot go stays where it was, rather than vanishing or
## landing on top of what is already there.
func test_dropping_onto_an_occupied_cell_puts_it_back() -> void:
	var cap := Itemdb.max_stack(&"log")
	Journal.gain(&"log", cap)
	Journal.gain(&"log", cap)
	_panel._open()
	var step: float = Bag.CELL + Bag.GAP
	var origin: Vector2 = _panel._origin()
	var first: Dictionary = Journal.stacks()[0]
	var second: Dictionary = Journal.stacks()[1]

	_panel._mouse = origin + Vector2(int(first["x"]) * step + 4.0, int(first["y"]) * step + 4.0)
	_panel._pick_up()
	_panel._mouse = origin + Vector2(int(second["x"]) * step + 4.0, int(second["y"]) * step + 4.0)
	_panel._put_down()

	var after: Dictionary = Journal.stacks()[0]
	assert_int(int(after["x"])).is_equal(int(first["x"]))
	assert_int(int(after["y"])) \
			.override_failure_message("a stack was dropped on top of another").is_equal(int(first["y"]))
	assert_int(Journal.count_of(&"log")) \
			.override_failure_message("a refused drop lost the items").is_equal(cap * 2)


## Closing mid-drag must not strand the stack or leave it stuck to the cursor.
func test_closing_while_carrying_something_puts_it_back() -> void:
	Journal.gain(&"log", 2)
	_panel._open()
	var start: Dictionary = Journal.stacks()[0]
	var step: float = Bag.CELL + Bag.GAP
	_panel._mouse = _panel._origin() \
			+ Vector2(int(start["x"]) * step + 4.0, int(start["y"]) * step + 4.0)
	_panel._pick_up()
	_panel._close()

	assert_int(_panel._held).is_equal(-1)
	var after: Dictionary = Journal.stacks()[0]
	assert_int(int(after["x"])).is_equal(int(start["x"]))
	assert_int(int(after["y"])).is_equal(int(start["y"]))
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


## The corner button, which is the way out for anyone playing with a mouse rather than
## reaching for a key.
func test_the_close_button_closes_the_bag() -> void:
	_panel._open()
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = _panel._close_rect().get_center()

	_panel._unhandled_input(press)

	assert_bool(_panel.visible) \
			.override_failure_message("clicking the close button left the bag open").is_false()


## The button lives in the title bar rather than over a cell, but it is still checked
## before the grid is, and that ordering is what this holds in place.
func test_the_close_button_does_not_pick_up_what_is_under_it() -> void:
	Journal.gain(&"log", 2)
	_panel._open()
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	press.position = _panel._close_rect().get_center()

	_panel._unhandled_input(press)

	assert_int(_panel._held) \
			.override_failure_message("closing the bag picked something up on the way out") \
			.is_equal(-1)
	assert_int(Journal.count_of(&"log")).is_equal(2)


## Dragging a stack clear of the bag is how a thing gets put down in the world.
func test_dragging_a_stack_off_the_bag_drops_it_on_the_floor() -> void:
	var field := _give_it_a_floor()
	Journal.gain(&"log", 3)
	_panel._open()
	var step: float = Bag.CELL + Bag.GAP
	var start: Dictionary = Journal.stacks()[0]
	_panel._mouse = _panel._origin() \
			+ Vector2(int(start["x"]) * step + 4.0, int(start["y"]) * step + 4.0)
	_panel._pick_up()

	_panel._mouse = _panel._chrome_rect().position - Vector2(60.0, 60.0)
	_panel._put_down()

	assert_int(Journal.count_of(&"log")) \
			.override_failure_message("the stack was dropped and stayed in the bag").is_equal(0)
	assert_int(field.items().size()).is_equal(1)
	assert_int(field.items()[0].count).is_equal(3)
	assert_int(_panel._held).is_equal(-1)


## Inside the bag but between cells is a fumble, not a throw.
func test_dropping_inside_the_bag_but_off_the_grid_puts_it_back() -> void:
	var field := _give_it_a_floor()
	Journal.gain(&"log", 3)
	_panel._open()
	var step: float = Bag.CELL + Bag.GAP
	var start: Dictionary = Journal.stacks()[0]
	_panel._mouse = _panel._origin() \
			+ Vector2(int(start["x"]) * step + 4.0, int(start["y"]) * step + 4.0)
	_panel._pick_up()

	_panel._mouse = _panel._origin() - Vector2(Bag.PAD * 0.5, Bag.PAD * 0.5)
	assert_vector(_panel._cell_under(_panel._mouse)) \
			.override_failure_message("the padding was read as part of the grid") \
			.is_equal(Vector2i(-1, -1))
	_panel._put_down()

	assert_int(Journal.count_of(&"log")) \
			.override_failure_message("a fumble inside the bag threw the stack on the floor") \
			.is_equal(3)
	assert_int(field.items().size()).is_equal(0)


## A bag with no world under it keeps what it is holding rather than deleting it.
func test_dropping_with_nowhere_to_land_keeps_the_stack() -> void:
	Journal.gain(&"log", 3)
	_panel._open()
	var step: float = Bag.CELL + Bag.GAP
	var start: Dictionary = Journal.stacks()[0]
	_panel._mouse = _panel._origin() \
			+ Vector2(int(start["x"]) * step + 4.0, int(start["y"]) * step + 4.0)
	_panel._pick_up()

	_panel._mouse = _panel._chrome_rect().position - Vector2(60.0, 60.0)
	_panel._put_down()

	assert_int(Journal.count_of(&"log")) \
			.override_failure_message("a stack was thrown into a world that was not there") \
			.is_equal(3)


## The tally under the grid counts cells rather than stacks, because a bag fills by shape.
func test_the_tally_counts_cells_not_stacks() -> void:
	assert_int(_panel._cells_used()).is_equal(0)
	Journal.gain(&"log", 2)

	var size := Itemdb.grid_size(&"log")
	assert_int(_panel._cells_used()) \
			.override_failure_message("a stack was counted as one cell regardless of its shape") \
			.is_equal(size.x * size.y)


## Weight is per item carried, not per stack.
func test_weight_counts_every_item_in_the_stack() -> void:
	assert_float(_panel._weight_carried()).is_equal(0.0)
	Journal.gain(&"log", 4)

	var each := float(Itemdb.item(&"log").get("weight", 0.0))
	assert_float(_panel._weight_carried()).is_equal_approx(each * 4.0, 0.001)


## Most of the itemdb has no art. A miss has to be an ordinary answer, and has to be
## remembered, or every redraw goes back to the filesystem for the same nothing.
func test_a_ref_with_no_icon_is_remembered_as_having_none() -> void:
	assert_object(_panel._icon(&"log")).is_null()
	assert_bool(_panel._icons.has(&"log")) \
			.override_failure_message("a missing icon was not cached, so it will be looked up again") \
			.is_true()


func test_an_icon_that_exists_is_loaded() -> void:
	assert_object(_panel._icon(&"beer")) \
			.override_failure_message("the copied-in art was not found under res://assets/items/icons") \
			.is_not_null()


## The cue that says letting go now throws the stack rather than putting it back.
func test_the_throw_cue_is_only_up_outside_the_bag() -> void:
	Journal.gain(&"log", 2)
	_panel._open()
	var step: float = Bag.CELL + Bag.GAP
	var start: Dictionary = Journal.stacks()[0]
	_panel._mouse = _panel._origin() \
			+ Vector2(int(start["x"]) * step + 4.0, int(start["y"]) * step + 4.0)
	_panel._pick_up()

	assert_bool(_panel._throwing()) \
			.override_failure_message("a stack over its own cell read as being thrown").is_false()

	_panel._mouse = _panel._origin() - Vector2(Bag.PAD * 0.5, Bag.PAD * 0.5)
	assert_bool(_panel._throwing()) \
			.override_failure_message("a fumble inside the bag read as a throw").is_false()

	_panel._mouse = _panel._chrome_rect().position - Vector2(60.0, 60.0)
	assert_bool(_panel._throwing()).is_true()


func test_nothing_in_hand_is_never_a_throw() -> void:
	_panel._open()
	_panel._mouse = _panel._chrome_rect().position - Vector2(60.0, 60.0)
	assert_bool(_panel._throwing()).is_false()


## Hovering is what the tooltip is keyed on.
func test_the_cursor_finds_the_stack_it_is_over() -> void:
	Journal.gain(&"log", 2)
	_panel._open()
	var step: float = Bag.CELL + Bag.GAP
	var start: Dictionary = Journal.stacks()[0]

	assert_int(_panel._stack_under(_panel._origin()
			+ Vector2(int(start["x"]) * step + 4.0, int(start["y"]) * step + 4.0))).is_equal(0)
	assert_int(_panel._stack_under(_panel._origin() - Vector2(80.0, 80.0))) \
			.override_failure_message("a cursor off the board reported a stack under it") \
			.is_equal(-1)


## The close button sits in the title bar, which is inside the bag, so releasing a stack
## on it must not be read as throwing the stack away.
func test_the_close_button_is_inside_the_bag() -> void:
	_panel._open()
	assert_bool(_panel._chrome_rect().encloses(_panel._close_rect())) \
			.override_failure_message("the close button hangs outside the drop boundary") \
			.is_true()
