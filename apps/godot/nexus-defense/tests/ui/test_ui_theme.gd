extends GdUnitTestSuite

const UiThemeBuilder := preload("res://ui/lib/ui_theme.gd")

var _theme: Theme

func before_test() -> void:
	_theme = UiThemeBuilder.build()

func test_default_font_size_set() -> void:
	assert_int(_theme.default_font_size).is_equal(16)

func test_panel_container_has_panel_stylebox() -> void:
	assert_bool(_theme.has_stylebox("panel", "PanelContainer")).is_true()
	assert_object(_theme.get_stylebox("panel", "PanelContainer")).is_instanceof(StyleBoxFlat)

func test_button_variants_registered() -> void:
	for variant in ["ButtonPrimary", "ButtonDanger", "ButtonGhost", "ButtonIcon"]:
		assert_bool(_theme.has_stylebox("normal", variant)).is_true()
		assert_bool(_theme.has_stylebox("hover", variant)).is_true()
		assert_bool(_theme.has_stylebox("pressed", variant)).is_true()
		assert_bool(_theme.has_stylebox("focus", variant)).is_true()
		assert_bool(_theme.has_stylebox("disabled", variant)).is_true()

func test_panel_variants_registered() -> void:
	for variant in ["PanelContainerGlass", "PanelContainerToast", "PanelContainerModal", "PanelContainerHud"]:
		assert_bool(_theme.has_stylebox("panel", variant)).is_true()

func test_progress_bar_styled() -> void:
	assert_bool(_theme.has_stylebox("background", "ProgressBar")).is_true()
	assert_bool(_theme.has_stylebox("fill", "ProgressBar")).is_true()

func test_label_font_color() -> void:
	assert_bool(_theme.has_color("font_color", "Label")).is_true()

func test_stylebox_helper_applies_corner_radius() -> void:
	var sb: StyleBoxFlat = UiThemeBuilder.stylebox(Color.WHITE, 12, 0, Color.BLACK, 8)
	assert_int(sb.corner_radius_top_left).is_equal(12)
	assert_int(sb.corner_radius_bottom_right).is_equal(12)

func test_stylebox_helper_applies_border_when_requested() -> void:
	var sb: StyleBoxFlat = UiThemeBuilder.stylebox(Color.WHITE, 8, 2, Color.RED, 4)
	assert_int(sb.border_width_top).is_equal(2)
	assert_that(sb.border_color).is_equal(Color.RED)
