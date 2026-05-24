extends GdUnitTestSuite

const Tokens := preload("res://ui/lib/tokens.gd")

func test_color_palette_distinct() -> void:
	assert_that(Tokens.COLOR_BG).is_not_equal(Tokens.COLOR_SURFACE)
	assert_that(Tokens.COLOR_ACCENT).is_not_equal(Tokens.COLOR_DANGER)
	assert_that(Tokens.COLOR_OK).is_not_equal(Tokens.COLOR_WARN)
	assert_that(Tokens.COLOR_TEXT).is_not_equal(Tokens.COLOR_TEXT_MUTED)

func test_spacing_monotonic() -> void:
	assert_int(Tokens.SPACE_XS).is_less(Tokens.SPACE_SM)
	assert_int(Tokens.SPACE_SM).is_less(Tokens.SPACE_MD)
	assert_int(Tokens.SPACE_MD).is_less(Tokens.SPACE_LG)
	assert_int(Tokens.SPACE_LG).is_less(Tokens.SPACE_XL)

func test_radius_monotonic() -> void:
	assert_int(Tokens.RADIUS_SM).is_less(Tokens.RADIUS_MD)
	assert_int(Tokens.RADIUS_MD).is_less(Tokens.RADIUS_LG)
	assert_int(Tokens.RADIUS_LG).is_less(Tokens.RADIUS_PILL)

func test_font_tables_complete() -> void:
	for table in [Tokens.FONT_DISPLAY, Tokens.FONT_H1, Tokens.FONT_H2, Tokens.FONT_BODY, Tokens.FONT_SMALL]:
		assert_bool(table.has("mobile")).is_true()
		assert_bool(table.has("tablet")).is_true()
		assert_bool(table.has("desktop")).is_true()

func test_font_sizes_scale_up_per_breakpoint() -> void:
	for table in [Tokens.FONT_DISPLAY, Tokens.FONT_H1, Tokens.FONT_H2, Tokens.FONT_BODY, Tokens.FONT_SMALL]:
		assert_int(int(table["mobile"])).is_less_equal(int(table["tablet"]))
		assert_int(int(table["tablet"])).is_less_equal(int(table["desktop"]))

func test_safe_margin_scales_up() -> void:
	assert_int(int(Tokens.SAFE_MARGIN["mobile"])).is_less(int(Tokens.SAFE_MARGIN["desktop"]))

func test_animation_durations_ordered() -> void:
	assert_float(Tokens.ANIM_FAST).is_less(Tokens.ANIM_MED)
	assert_float(Tokens.ANIM_MED).is_less(Tokens.ANIM_SLOW)

func test_overlay_color_is_partially_transparent() -> void:
	assert_float(Tokens.COLOR_OVERLAY.a).is_greater(0.0)
	assert_float(Tokens.COLOR_OVERLAY.a).is_less(1.0)
