extends Node2D

const ENEMY_SHADER := preload("res://ui/shaders/enemy.gdshader")

signal reached_end()

@export var sprite_size: Vector2 = Vector2(28, 28):
	set(value):
		sprite_size = value
		if _rect:
			_rect.size = value
			_rect.position = -value * 0.5
			_push_uniforms()
@export var body_color: Color = Color(0.95, 0.42, 0.46, 1.0):
	set(value):
		body_color = value
		_push_uniforms()
@export var highlight_color: Color = Color(1.0, 0.85, 0.55, 1.0):
	set(value):
		highlight_color = value
		_push_uniforms()
@export var radius_px: float = 9.0:
	set(value):
		radius_px = clamp(value, 4.0, 16.0)
		_push_uniforms()

var path_points: PackedVector2Array = PackedVector2Array()
var duration: float = 8.0
var _elapsed: float = 0.0
var _running: bool = false
var _phase: float = 0.0
var _rect: ColorRect = null
var _mat: ShaderMaterial = null

func _ready() -> void:
	_build()

func _build() -> void:
	_mat = ShaderMaterial.new()
	_mat.shader = ENEMY_SHADER
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
	_mat.set_shader_parameter("body_color", body_color)
	_mat.set_shader_parameter("highlight_color", highlight_color)
	_mat.set_shader_parameter("radius", radius_px)
	_mat.set_shader_parameter("rect_size", sprite_size)
	_mat.set_shader_parameter("jitter_phase", _phase)

func start(points: PackedVector2Array, march_seconds: float) -> void:
	path_points = points
	duration = max(march_seconds, 0.1)
	_elapsed = 0.0
	if path_points.size() > 0:
		position = path_points[0]
	_running = path_points.size() >= 2
	set_process(_running)

func _process(delta: float) -> void:
	if not _running:
		return
	_elapsed += delta
	_phase += delta * 8.0
	if _mat:
		_mat.set_shader_parameter("jitter_phase", _phase)
	var t: float = clamp(_elapsed / duration, 0.0, 1.0)
	position = _sample_path(t)
	if t >= 1.0:
		_running = false
		set_process(false)
		reached_end.emit()
		queue_free()

func _sample_path(t: float) -> Vector2:
	var n: int = path_points.size()
	if n == 0:
		return Vector2.ZERO
	if n == 1 or t <= 0.0:
		return path_points[0]
	if t >= 1.0:
		return path_points[n - 1]
	var segments: float = float(n - 1)
	var pos_f: float = t * segments
	var idx: int = int(floor(pos_f))
	var frac: float = pos_f - float(idx)
	if idx >= n - 1:
		return path_points[n - 1]
	return path_points[idx].lerp(path_points[idx + 1], frac)
