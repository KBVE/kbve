extends GdUnitTestSuite


const Toast := preload("res://src/ui/toast.gd")

var _was: Dictionary = {}
var _toast: CanvasLayer


func before_test() -> void:
	_was = Journal.satchel()
	Journal.forget_everything()
	_toast = CanvasLayer.new()
	_toast.set_script(Toast)
	add_child(_toast)
	auto_free(_toast)


func after_test() -> void:
	Journal.forget_everything()
	for ref: StringName in _was:
		Journal.gain(ref, int(_was[ref]))
	Journal.save_now()


func test_something_arriving_is_said() -> void:
	Journal.gain(&"log", 2)

	var lines: Array = _toast.lines()
	assert_int(lines.size()).is_equal(1)
	assert_str(str(lines[0]["text"])) \
			.override_failure_message("the notice did not say how many arrived").contains("2")
	assert_str(str(lines[0]["text"])).contains(Itemdb.display_name(&"log"))


func test_a_full_bag_says_so_and_says_it_differently() -> void:
	var cap := Itemdb.max_stack(&"log")
	var cells := Journal.COLS * Journal.ROWS
	Journal.gain(&"log", cap * cells + 3)

	var warned: Array = _toast.lines().filter(
			func(l: Dictionary) -> bool: return l["color"] == Toast.WARN)
	assert_int(warned.size()) \
			.override_failure_message("a bag too full to take the loot said nothing about it") \
			.is_equal(1)
	assert_str(str(warned[0]["text"])).contains("3")


func test_the_same_thing_twice_is_one_line_that_counts() -> void:
	Journal.gain(&"log", 1)
	Journal.gain(&"log", 1)

	var lines: Array = _toast.lines()
	assert_int(lines.size()) \
			.override_failure_message("two identical notices stacked up instead of merging") \
			.is_equal(1)
	assert_int(int(lines[0]["times"])).is_equal(2)


func test_different_things_get_their_own_line() -> void:
	Journal.gain(&"log", 1)
	Journal.gain(&"stone", 1)
	assert_int(_toast.lines().size()).is_equal(2)


func test_a_notice_goes_away_on_its_own() -> void:
	_toast.show_toast("something happened")
	assert_int(_toast.lines().size()).is_equal(1)

	_toast._process(Toast.SECONDS * 0.5)
	assert_int(_toast.lines().size()).is_equal(1)
	_toast._process(Toast.SECONDS)
	assert_int(_toast.lines().size()) \
			.override_failure_message("the notice stayed on screen for ever").is_equal(0)


func test_a_repeat_puts_the_clock_back() -> void:
	_toast.show_toast("something happened")
	_toast._process(Toast.SECONDS * 0.9)
	_toast.show_toast("something happened")
	_toast._process(Toast.SECONDS * 0.5)

	assert_int(_toast.lines().size()) \
			.override_failure_message("a refreshed notice expired on the old clock").is_equal(1)


func test_an_empty_notice_is_not_a_notice() -> void:
	_toast.show_toast("")
	assert_int(_toast.lines().size()).is_equal(0)
