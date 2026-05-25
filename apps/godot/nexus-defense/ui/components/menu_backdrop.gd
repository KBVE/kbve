extends PanelContainer

const BACKDROP_SHADER := preload("res://ui/shaders/menu_backdrop.gdshader")

@export var corner_radius: float = 16.0:
	set(value):
		corner_radius = value
		if _mat:
			_mat.set_shader_parameter("corner_radius", value)
@export var accent_color: Color = Color(0.32, 0.78, 0.95, 1.0):
	set(value):
		accent_color = value
		if _mat:
			_mat.set_shader_parameter("accent_color", value)
@export var bg_top: Color = Color(0.10, 0.13, 0.18, 0.96):
	set(value):
		bg_top = value
		if _mat:
			_mat.set_shader_parameter("bg_top", value)
@export var bg_bottom: Color = Color(0.04, 0.05, 0.08, 0.96):
	set(value):
		bg_bottom = value
		if _mat:
			_mat.set_shader_parameter("bg_bottom", value)
@export var overlay_alpha: float = 0.28:
	set(value):
		overlay_alpha = value
		if _overlay:
			_overlay.color = Color(0, 0, 0, value)

var _patch: NinePatchRect = null
var _overlay: ColorRect = null
var _mat: ShaderMaterial = null
static var _shared_white_tex: ImageTexture = null

func _ready() -> void:
	add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	_build()
	resized.connect(_on_resized)
	_on_resized()

func _build() -> void:
	_patch = NinePatchRect.new()
	_patch.name = "Backdrop"
	_patch.texture = _white_texture()
	_patch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mat = ShaderMaterial.new()
	_mat.shader = BACKDROP_SHADER
	_mat.set_shader_parameter("bg_top", bg_top)
	_mat.set_shader_parameter("bg_bottom", bg_bottom)
	_mat.set_shader_parameter("accent_color", accent_color)
	_mat.set_shader_parameter("corner_radius", corner_radius)
	_mat.set_shader_parameter("rect_size", size)
	_patch.material = _mat
	add_child(_patch)
	move_child(_patch, 0)

	_overlay = ColorRect.new()
	_overlay.name = "Overlay"
	_overlay.color = Color(0, 0, 0, overlay_alpha)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_overlay)
	move_child(_overlay, 1)

func _on_resized() -> void:
	if _mat:
		_mat.set_shader_parameter("rect_size", size)

static func _white_texture() -> ImageTexture:
	if _shared_white_tex == null:
		var img := Image.create(1, 1, false, Image.FORMAT_RGBA8)
		img.set_pixel(0, 0, Color.WHITE)
		_shared_white_tex = ImageTexture.create_from_image(img)
	return _shared_white_tex
