extends Node2D

const TOWER_SHADER := preload("res://ui/shaders/tower.gdshader")

const TYPE_ARROW := 0
const TYPE_CANNON := 1
const TYPE_FROST := 2
const TYPE_MAGIC := 3

const TYPE_FROM_ID := {
	"arrow": TYPE_ARROW,
	"cannon": TYPE_CANNON,
	"frost": TYPE_FROST,
	"magic": TYPE_MAGIC,
}

const ACCENT_FROM_ID := {
	"arrow": Color(0.34, 0.85, 0.45, 1.0),
	"cannon": Color(0.95, 0.55, 0.32, 1.0),
	"frost": Color(0.5, 0.78, 0.95, 1.0),
	"magic": Color(0.8, 0.5, 0.95, 1.0),
}

@export var sprite_size: Vector2 = Vector2(48, 48):
	set(value):
		sprite_size = value
		if _rect:
			_rect.size = value
			_rect.position = -value * 0.5
			_push_uniforms()
@export var tower_type: int = TYPE_ARROW:
	set(value):
		tower_type = clamp(value, 0, 3)
		_push_uniforms()
@export var base_color: Color = Color(0.32, 0.36, 0.46, 1.0):
	set(value):
		base_color = value
		_push_uniforms()
@export var accent_color: Color = Color(0.32, 0.78, 0.95, 1.0):
	set(value):
		accent_color = value
		_push_uniforms()
@export var level: float = 1.0:
	set(value):
		level = clamp(value, 0.5, 3.0)
		_push_uniforms()

var _rect: ColorRect = null
var _mat: ShaderMaterial = null

func _ready() -> void:
	_build()

func _build() -> void:
	_mat = ShaderMaterial.new()
	_mat.shader = TOWER_SHADER
	_rect = ColorRect.new()
	_rect.size = sprite_size
	_rect.position = -sprite_size * 0.5
	_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_rect.material = _mat
	add_child(_rect)
	_push_uniforms()

func _push_uniforms() -> void:
	if _mat == null:
		return
	_mat.set_shader_parameter("tower_type", tower_type)
	_mat.set_shader_parameter("base_color", base_color)
	_mat.set_shader_parameter("accent_color", accent_color)
	_mat.set_shader_parameter("level", level)
	_mat.set_shader_parameter("rect_size", sprite_size)

func apply_id(tower_id: String) -> void:
	tower_type = int(TYPE_FROM_ID.get(tower_id, TYPE_ARROW))
	accent_color = ACCENT_FROM_ID.get(tower_id, accent_color)

func apply(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	if data.has("id"):
		apply_id(String(data["id"]))
	if data.has("tower_type"):
		tower_type = int(data["tower_type"])
	if data.has("accent_color"):
		accent_color = data["accent_color"]
	if data.has("base_color"):
		base_color = data["base_color"]
	if data.has("level"):
		level = float(data["level"])
	if data.has("size"):
		sprite_size = data["size"]
