extends GdUnitTestSuite

const BootScreen := preload("res://ui/components/boot_screen.gd")

func test_apply_overrides_title_and_subtitle() -> void:
	var b: Control = auto_free(BootScreen.new())
	add_child(b)
	await await_idle_frame()
	b.call("apply", {"title": "Test Boot", "subtitle": "running suite"})
	assert_str(String(b.get("title_text"))).is_equal("Test Boot")
	assert_str(String(b.get("subtitle_text"))).is_equal("running suite")

func test_spinner_angle_advances_in_process() -> void:
	var b: Control = auto_free(BootScreen.new())
	add_child(b)
	await await_idle_frame()
	var before: float = float(b.get("_spinner_angle"))
	await get_tree().create_timer(0.1).timeout
	var after: float = float(b.get("_spinner_angle"))
	assert_float(after).is_not_equal(before)
