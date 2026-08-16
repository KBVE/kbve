extends GdUnitTestSuite

## The bag as the player handles it: opening it, and dragging things around inside it.

const Bag := preload("res://src/ui/satchel_panel.gd")

var _was: Dictionary = {}
var _panel: CanvasLayer


func before_test() -> void:
	_was = Journal.satchel()
	Journal.forget_everything()
	_panel = CanvasLayer.new()
	_panel.set_script(Bag)
	add_child(_panel)
	auto_free(_panel)


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
