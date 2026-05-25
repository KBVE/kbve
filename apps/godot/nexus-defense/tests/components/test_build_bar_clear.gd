extends GdUnitTestSuite

const BuildBar := preload("res://ui/components/build_bar.gd")

var _bar: Control

func before_test() -> void:
	_bar = auto_free(BuildBar.new())
	add_child(_bar)
	await await_idle_frame()

func test_clear_selection_resets_selected_id() -> void:
	_bar.call("_on_tower_pressed", "arrow")
	assert_str(String(_bar.get("selected_id"))).is_equal("arrow")
	_bar.call("clear_selection")
	assert_str(String(_bar.get("selected_id"))).is_equal("")

func test_clear_selection_is_noop_when_already_clear() -> void:
	_bar.call("clear_selection")
	assert_str(String(_bar.get("selected_id"))).is_equal("")
