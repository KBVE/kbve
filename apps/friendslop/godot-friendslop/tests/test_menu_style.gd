extends GdUnitTestSuite

## The one place the menus agree on how big to draw themselves.


## Desktop has no notch or home indicator, so the insets have to come back as nothing
## rather than as a guess that would push every menu inward on a plain window.
func test_a_desktop_window_reports_no_insets() -> void:
	var insets := MenuStyle.safe_insets(get_tree().root)
	for side in [insets.x, insets.y, insets.z, insets.w]:
		assert_float(side).is_greater_equal(0.0)


## A null viewport turns up while a menu is leaving the tree; it must answer rather than
## fault, or teardown takes the layout pass down with it.
func test_a_missing_viewport_is_answered_not_faulted() -> void:
	assert_vector(MenuStyle.safe_insets(null)).is_equal(Vector4.ZERO)
	assert_float(MenuStyle.ui_scale(null)).is_equal(1.0)


## One rule for every menu: the scale is clamped, and a touchscreen never goes below the
## floor that keeps controls poke-able.
func test_the_scale_stays_inside_its_range() -> void:
	var was := MenuStyle.touch
	MenuStyle.touch = false
	var s := MenuStyle.ui_scale(get_tree().root)
	assert_float(s).is_greater_equal(MenuStyle.SCALE_RANGE.x)
	assert_float(s).is_less_equal(MenuStyle.SCALE_RANGE.y)
	MenuStyle.touch = true
	assert_float(MenuStyle.ui_scale(get_tree().root)).is_greater_equal(MenuStyle.TOUCH_MIN_SCALE)
	MenuStyle.touch = was
