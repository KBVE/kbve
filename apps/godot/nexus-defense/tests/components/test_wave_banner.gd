extends GdUnitTestSuite

const WaveBanner := preload("res://ui/components/wave_banner.gd")

func test_apply_overrides_title_and_subtitle() -> void:
	var b: Control = auto_free(WaveBanner.new())
	add_child(b)
	await await_idle_frame()
	b.call("apply", {"title": "Wave 9", "subtitle": "Boss inbound"})
	assert_str(String(b.get("title_text"))).is_equal("Wave 9")
	assert_str(String(b.get("subtitle_text"))).is_equal("Boss inbound")

func test_apply_duration() -> void:
	var b: Control = auto_free(WaveBanner.new())
	add_child(b)
	await await_idle_frame()
	b.call("apply", {"duration": 4.2})
	assert_float(float(b.get("duration"))).is_equal_approx(4.2, 0.001)

func test_default_text_when_built() -> void:
	var b: Control = auto_free(WaveBanner.new())
	add_child(b)
	await await_idle_frame()
	assert_str(String(b.get("title_text"))).is_equal("Wave 1")
