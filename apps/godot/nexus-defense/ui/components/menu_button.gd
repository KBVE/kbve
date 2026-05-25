extends Control

const Tokens := preload("res://ui/lib/tokens.gd")
const PANEL_SHADER := preload("res://ui/shaders/menu_panel.gdshader")

signal pressed()

@export var text: String = "":
	set(value):
		text = value
		if _button:
			_button.text = value
@export var corner_radius: float = 10.0:
	set(value):
		corner_radius = value
		if _mat:
			_mat.set_shader_parameter("corner_radius", value)
@export var bg_color: Color = Color(0.09, 0.11, 0.15, 0.94):
	set(value):
		bg_color = value
		if _mat:
			_mat.set_shader_parameter("bg_color", value)
@export var accent_color: Color = Color(0.32, 0.78, 0.95, 1.0):
	set(value):
		accent_color = value
		if _mat:
			_mat.set_shader_parameter("accent_color", value)
			_mat.set_shader_parameter("glow_color", Color(value.r, value.g, value.b, 0.55))
@export var overlay_alpha: float = 0.22:
	set(value):
		overlay_alpha = value
		if _overlay:
			_overlay.color = Color(0, 0, 0, value)

var _patch: NinePatchRect
var _overlay: ColorRect
var _button: Button
var _mat: ShaderMaterial
var _hover: float = 0.0
var _target_hover: float = 0.0
static var _shared_white_tex: ImageTexture = null

func _ready() -> void:
	custom_minimum_size.y = max(custom_minimum_size.y, 48.0)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()
	resized.connect(_on_resized)
	_on_resized()

func _build() -> void:
	_patch = NinePatchRect.new()
	_patch.texture = _white_texture()
	_patch.set_anchors_preset(Control.PRESET_FULL_RECT)
	_patch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_patch.patch_margin_left = 0
	_patch.patch_margin_top = 0
	_patch.patch_margin_right = 0
	_patch.patch_margin_bottom = 0
	_mat = ShaderMaterial.new()
	_mat.shader = PANEL_SHADER
	_mat.set_shader_parameter("bg_color", bg_color)
	_mat.set_shader_parameter("accent_color", accent_color)
	_mat.set_shader_parameter("glow_color", Color(accent_color.r, accent_color.g, accent_color.b, 0.55))
	_mat.set_shader_parameter("border_width", 1.5)
	_mat.set_shader_parameter("corner_radius", corner_radius)
	_mat.set_shader_parameter("glow_strength", 0.0)
	_mat.set_shader_parameter("rect_size", size)
	_patch.material = _mat
	add_child(_patch)

	_overlay = ColorRect.new()
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.color = Color(0, 0, 0, overlay_alpha)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_overlay)

	_button = Button.new()
	_button.set_anchors_preset(Control.PRESET_FULL_RECT)
	_button.text = text
	_button.flat = true
	_button.focus_mode = Control.FOCUS_ALL
	_button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state in ["normal", "hover", "pressed", "focus", "disabled"]:
		_button.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	_button.add_theme_color_override("font_color", Tokens.COLOR_TEXT)
	_button.add_theme_color_override("font_hover_color", Color(0.95, 0.99, 1.0))
	_button.add_theme_color_override("font_pressed_color", accent_color)
	_button.add_theme_color_override("font_focus_color", Tokens.COLOR_TEXT)
	_button.add_theme_color_override("font_disabled_color", Tokens.COLOR_TEXT_MUTED)
	_button.pressed.connect(func() -> void: pressed.emit())
	_button.mouse_entered.connect(_on_hover_enter)
	_button.mouse_exited.connect(_on_hover_exit)
	_button.focus_entered.connect(_on_hover_enter)
	_button.focus_exited.connect(_on_hover_exit)
	add_child(_button)
	set_process(true)

func _process(delta: float) -> void:
	if is_equal_approx(_hover, _target_hover):
		return
	_hover = move_toward(_hover, _target_hover, delta * 6.0)
	if _mat:
		_mat.set_shader_parameter("glow_strength", _hover)

func _on_hover_enter() -> void:
	_target_hover = 1.0

func _on_hover_exit() -> void:
	_target_hover = 0.0

func _on_resized() -> void:
	if _mat:
		_mat.set_shader_parameter("rect_size", size)

func set_disabled(disabled: bool) -> void:
	if _button:
		_button.disabled = disabled
	modulate.a = 0.55 if disabled else 1.0

func is_disabled() -> bool:
	return _button != null and _button.disabled

static func _white_texture() -> ImageTexture:
	if _shared_white_tex == null:
		var img := Image.create(1, 1, false, Image.FORMAT_RGBA8)
		img.set_pixel(0, 0, Color.WHITE)
		_shared_white_tex = ImageTexture.create_from_image(img)
	return _shared_white_tex
