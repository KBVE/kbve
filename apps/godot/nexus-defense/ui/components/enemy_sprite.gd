extends Node2D

const ENEMY_SHADER := preload("res://ui/shaders/enemy.gdshader")

# Default snapshot interval the server emits at (10 Hz → 100 ms). When the
# client gets a position update we lerp the sprite from its current pos to
# the new server pos over roughly this window so the motion stays smooth
# instead of teleporting every 100 ms.
const SERVER_LERP_SECONDS: float = 0.1

# HP bar layout.
const HP_BAR_WIDTH: float = 26.0
const HP_BAR_HEIGHT: float = 3.0
const HP_BAR_Y_OFFSET: float = -18.0

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

# Cosmetic (offline) path-march state.
var path_points: PackedVector2Array = PackedVector2Array()
var duration: float = 8.0
var _elapsed: float = 0.0
var _running: bool = false
var _phase: float = 0.0
var _rect: ColorRect = null
var _mat: ShaderMaterial = null

# Server-authoritative interpolation state.
var _server_driven: bool = false
var _lerp_from: Vector2 = Vector2.ZERO
var _lerp_to: Vector2 = Vector2.ZERO
var _lerp_elapsed: float = 0.0
var _lerp_duration: float = SERVER_LERP_SECONDS

# HP bar state.
var hp: float = 1.0
var max_hp: float = 1.0
var _hp_root: Node2D = null

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
	_hp_root = Node2D.new()
	_hp_root.position = Vector2(0, HP_BAR_Y_OFFSET)
	_hp_root.visible = false
	_hp_root.draw.connect(_draw_hp_bar)
	add_child(_hp_root)
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
	_server_driven = false
	if path_points.size() > 0:
		position = path_points[0]
	_running = path_points.size() >= 2
	set_process(_running)

## Snapshot-driven entry point — first call seeds the sprite at `pos` without
## interpolation; subsequent calls lerp from the current sprite position to the
## new `pos` over roughly `SERVER_LERP_SECONDS`.
func update_from_server(pos: Vector2, hp_value: float, max_hp_value: float) -> void:
	if not _server_driven:
		_server_driven = true
		_running = false
		position = pos
		_lerp_from = pos
		_lerp_to = pos
		_lerp_elapsed = _lerp_duration
	else:
		_lerp_from = position
		_lerp_to = pos
		_lerp_elapsed = 0.0
	hp = hp_value
	max_hp = max(max_hp_value, 0.0001)
	if _hp_root:
		_hp_root.visible = true
		_hp_root.queue_redraw()
	set_process(true)

func _process(delta: float) -> void:
	_phase += delta * 8.0
	if _mat:
		_mat.set_shader_parameter("jitter_phase", _phase)
	if _server_driven:
		if _lerp_elapsed < _lerp_duration:
			_lerp_elapsed = min(_lerp_elapsed + delta, _lerp_duration)
			var t: float = _lerp_elapsed / _lerp_duration
			position = _lerp_from.lerp(_lerp_to, t)
		else:
			position = _lerp_to
		return
	if not _running:
		return
	_elapsed += delta
	var t_path: float = clamp(_elapsed / duration, 0.0, 1.0)
	position = _sample_path(t_path)
	if t_path >= 1.0:
		_running = false
		set_process(false)
		reached_end.emit()
		queue_free()

func _draw_hp_bar() -> void:
	if _hp_root == null:
		return
	var ratio: float = clamp(hp / max_hp, 0.0, 1.0)
	var bg := Rect2(Vector2(-HP_BAR_WIDTH * 0.5, 0), Vector2(HP_BAR_WIDTH, HP_BAR_HEIGHT))
	_hp_root.draw_rect(bg, Color(0, 0, 0, 0.6), true)
	if ratio > 0.0:
		var fill := Rect2(bg.position, Vector2(HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT))
		_hp_root.draw_rect(fill, _hp_color(ratio), true)
	_hp_root.draw_rect(bg, Color(0.05, 0.05, 0.08, 0.85), false, 1.0)

func _hp_color(ratio: float) -> Color:
	if ratio > 0.5:
		return Color(0.36, 0.78, 0.46)
	if ratio > 0.25:
		return Color(0.95, 0.78, 0.32)
	return Color(0.95, 0.42, 0.46)

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
