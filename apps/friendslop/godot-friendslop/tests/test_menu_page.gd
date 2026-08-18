extends GdUnitTestSuite


const Page := preload("res://src/ui/components/menu_page.gd")

const BOOK := Rect2(0.435294, 0.159095, 0.129411, 0.702266)
const ROOT := Vector2(1280.0, 720.0)


func _spread() -> Array:
	var panel := Control.new()
	panel.size = ROOT
	add_child(panel)
	auto_free(panel)

	var left: MenuPage = Page.make(MenuStyle.Side.LEFT, panel)
	var right: MenuPage = Page.make(MenuStyle.Side.RIGHT, panel)
	left.pair_with(right)

	for page: MenuPage in [left, right]:
		for label: String in ["Ground Detail", "Resolution", "Post FX"]:
			page.add_cycler(label,
					func() -> Array: return ["Off", "Custom", "80/m2"],
					func() -> int: return 0,
					func(_i: int) -> void: pass,
					3)
	right.add_button("Back", Callable())
	return [left, right, panel]


func _lay_out(page: MenuPage) -> float:
	var metrics := MenuStyle.row_metrics(BOOK.size.y, ROOT.y)
	page.layout(BOOK, metrics)
	return ROOT.x * (page.anchor_right - page.anchor_left)


func test_a_page_never_asks_to_be_wider_than_its_anchors() -> void:
	for page: MenuPage in _spread().slice(0, 2):
		var allowed := _lay_out(page)
		assert_float(page.get_combined_minimum_size().x) \
				.override_failure_message("a row pushed the page past its anchors, which walks it off the paper") \
				.is_less_equal(allowed)


func test_laying_out_a_page_clears_the_fixed_row_width() -> void:
	var spread := _spread()
	var page: MenuPage = spread[0]
	_lay_out(page)
	for row in page.box.get_children():
		for control in row.get_children() if row is HBoxContainer else [row]:
			assert_float((control as Control).custom_minimum_size.x) \
					.override_failure_message("%s still asks for a fixed width on a page" % control.name) \
					.is_equal(0.0)


func test_the_button_shadow_stays_inside_the_gap_between_rows() -> void:
	var styles := MenuStyle.button_styles()
	var normal: StyleBoxFlat = styles.normal
	var hover: StyleBoxFlat = styles.hover
	assert_float(float(normal.shadow_size) + normal.shadow_offset.y) \
			.override_failure_message("the shadow reaches into the row below it") \
			.is_less(8.0)
	assert_int(hover.shadow_size).is_less_equal(8)
