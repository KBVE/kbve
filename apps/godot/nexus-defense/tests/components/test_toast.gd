extends GdUnitTestSuite

const Toast := preload("res://ui/components/toast.gd")

func test_toast_self_destructs_after_duration() -> void:
	var t: Control = Toast.new()
	add_child(t)
	await await_idle_frame()
	t.call("show_toast", "test message", 0.05, "info")
	assert_bool(is_instance_valid(t)).is_true()
	await get_tree().create_timer(0.6).timeout
	assert_bool(is_instance_valid(t)).is_false()

func test_toast_kind_color_mapping() -> void:
	var t: Control = auto_free(Toast.new())
	add_child(t)
	await await_idle_frame()
	var Tokens := preload("res://ui/lib/tokens.gd")
	assert_that(t.call("_kind_color", "ok")).is_equal(Tokens.COLOR_OK)
	assert_that(t.call("_kind_color", "warn")).is_equal(Tokens.COLOR_WARN)
	assert_that(t.call("_kind_color", "danger")).is_equal(Tokens.COLOR_DANGER)
	assert_that(t.call("_kind_color", "info")).is_equal(Tokens.COLOR_ACCENT)
	assert_that(t.call("_kind_color", "unknown")).is_equal(Tokens.COLOR_ACCENT)

func test_position_in_stack_records_index() -> void:
	var t: Control = auto_free(Toast.new())
	add_child(t)
	await await_idle_frame()
	t.call("position_in_stack", 3)
	assert_int(int(t.get("_stack_index"))).is_equal(3)
