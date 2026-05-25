extends GdUnitTestSuite

const NdMenuButton := preload("res://ui/components/menu_button.gd")

var _btn: Control

func before_test() -> void:
	_btn = auto_free(NdMenuButton.new())
	_btn.text = "Click"
	add_child(_btn)
	await await_idle_frame()

func test_builds_patch_overlay_button() -> void:
	var patch: NinePatchRect = _btn.get("_patch")
	var overlay: ColorRect = _btn.get("_overlay")
	var inner: Button = _btn.get("_button")
	assert_object(patch).is_not_null()
	assert_object(overlay).is_not_null()
	assert_object(inner).is_not_null()

func test_inner_button_has_shader_material() -> void:
	var patch: NinePatchRect = _btn.get("_patch")
	assert_object(patch.material).is_instanceof(ShaderMaterial)

func test_text_setter_propagates_to_inner_button() -> void:
	_btn.text = "Sign Out"
	var inner: Button = _btn.get("_button")
	assert_str(inner.text).is_equal("Sign Out")

func test_pressed_signal_proxies_inner_button() -> void:
	var monitor: Variant = monitor_signals(_btn, false)
	var inner: Button = _btn.get("_button")
	inner.emit_signal("pressed")
	await assert_signal(monitor).is_emitted("pressed")

func test_set_disabled_disables_inner_button_and_dims_root() -> void:
	_btn.call("set_disabled", true)
	var inner: Button = _btn.get("_button")
	assert_bool(inner.disabled).is_true()
	assert_float(_btn.modulate.a).is_less(1.0)
	_btn.call("set_disabled", false)
	assert_bool(inner.disabled).is_false()
	assert_float(_btn.modulate.a).is_equal_approx(1.0, 0.001)

func test_accent_color_setter_updates_shader_param() -> void:
	_btn.accent_color = Color(1.0, 0.4, 0.4, 1.0)
	var mat: ShaderMaterial = _btn.get("_mat")
	var got: Color = mat.get_shader_parameter("accent_color")
	assert_that(got).is_equal(Color(1.0, 0.4, 0.4, 1.0))

func test_resize_updates_rect_size_uniform() -> void:
	_btn.size = Vector2(200, 64)
	_btn.call("_on_resized")
	var mat: ShaderMaterial = _btn.get("_mat")
	var got: Vector2 = mat.get_shader_parameter("rect_size")
	assert_that(got).is_equal(Vector2(200, 64))
