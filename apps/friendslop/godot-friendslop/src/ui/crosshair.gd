extends CanvasLayer

@export var arm := 7.0
@export var gap := 3.0
@export var thickness := 2.0
@export var dot := 1.5
@export var color := Color(1.0, 1.0, 1.0, 0.85)
@export var outline := Color(0.0, 0.0, 0.0, 0.5)

var _settings: Node
var _draw_layer: Control


func _ready() -> void:
	layer = 10
	_draw_layer = Control.new()
	_draw_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_draw_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_draw_layer.draw.connect(_draw_crosshair)
	add_child(_draw_layer)
	get_window().size_changed.connect(_draw_layer.queue_redraw)

	_settings = get_tree().current_scene.get_node_or_null("GameplaySettings")
	if _settings:
		_settings.changed.connect(_read_settings)
		_read_settings()


func _read_settings() -> void:
	visible = _settings.crosshair and not get_tree().paused


func _draw_crosshair() -> void:
	var c := _draw_layer.size * 0.5
	for pass_i in 2:
		var col := outline if pass_i == 0 else color
		var w := thickness + 2.0 if pass_i == 0 else thickness
		_draw_layer.draw_line(c + Vector2(-gap - arm, 0.0), c + Vector2(-gap, 0.0), col, w)
		_draw_layer.draw_line(c + Vector2(gap, 0.0), c + Vector2(gap + arm, 0.0), col, w)
		_draw_layer.draw_line(c + Vector2(0.0, -gap - arm), c + Vector2(0.0, -gap), col, w)
		_draw_layer.draw_line(c + Vector2(0.0, gap), c + Vector2(0.0, gap + arm), col, w)
		_draw_layer.draw_circle(c, dot + 1.0 if pass_i == 0 else dot, col)
