extends GdUnitTestSuite

const NdMenuBackdrop := preload("res://ui/components/menu_backdrop.gd")

var _panel: PanelContainer

func before_test() -> void:
	_panel = auto_free(NdMenuBackdrop.new())
	_panel.custom_minimum_size = Vector2(300, 200)
	add_child(_panel)
	await await_idle_frame()

func test_backdrop_and_overlay_built() -> void:
	assert_object(_panel.get("_patch")).is_not_null()
	assert_object(_panel.get("_overlay")).is_not_null()

func test_backdrop_uses_shader_material() -> void:
	var patch: NinePatchRect = _panel.get("_patch")
	assert_object(patch.material).is_instanceof(ShaderMaterial)

func test_panel_stylebox_is_empty_so_shader_shows() -> void:
	var sb: StyleBox = _panel.get_theme_stylebox("panel")
	assert_object(sb).is_instanceof(StyleBoxEmpty)

func test_overlay_is_translucent_black() -> void:
	var ov: ColorRect = _panel.get("_overlay")
	assert_float(ov.color.a).is_greater(0.0)
	assert_float(ov.color.a).is_less(1.0)
	assert_float(ov.color.r).is_equal_approx(0.0, 0.001)

func test_resize_pushes_rect_size_to_shader() -> void:
	_panel.size = Vector2(360, 240)
	_panel.call("_on_resized")
	var mat: ShaderMaterial = _panel.get("_mat")
	var got: Vector2 = mat.get_shader_parameter("rect_size")
	assert_that(got).is_equal(Vector2(360, 240))

func test_accent_setter_pushes_shader_param() -> void:
	_panel.accent_color = Color(1.0, 0.3, 0.3, 1.0)
	var mat: ShaderMaterial = _panel.get("_mat")
	var got: Color = mat.get_shader_parameter("accent_color")
	assert_that(got).is_equal(Color(1.0, 0.3, 0.3, 1.0))

func test_overlay_alpha_setter_updates_overlay() -> void:
	_panel.overlay_alpha = 0.5
	var ov: ColorRect = _panel.get("_overlay")
	assert_float(ov.color.a).is_equal_approx(0.5, 0.001)

func test_corner_radius_setter_pushes_shader_param() -> void:
	_panel.corner_radius = 32.0
	var mat: ShaderMaterial = _panel.get("_mat")
	var got: float = mat.get_shader_parameter("corner_radius")
	assert_float(got).is_equal_approx(32.0, 0.001)

func test_user_content_added_after_backdrop_and_overlay() -> void:
	var label := Label.new()
	label.text = "content"
	_panel.add_child(label)
	await await_idle_frame()
	var idx: int = label.get_index()
	var patch_idx: int = (_panel.get("_patch") as Node).get_index()
	var overlay_idx: int = (_panel.get("_overlay") as Node).get_index()
	assert_int(patch_idx).is_equal(0)
	assert_int(overlay_idx).is_equal(1)
	assert_int(idx).is_greater(overlay_idx)
