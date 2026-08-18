extends CanvasLayer


const MARGIN := Vector2(26.0, 26.0)
const BAR := Vector2(168.0, 9.0)
const GAP := 6.0
const LABEL_FONT := 12
const RADIUS := 3.0

const TRACK := Color(0.09, 0.07, 0.05, 0.72)
const EDGE := Color(0.42, 0.31, 0.18, 0.55)
const HEALTH := Color(0.72, 0.18, 0.16, 0.95)
const MANA := Color(0.24, 0.42, 0.74, 0.95)
const ENERGY := Color(0.42, 0.62, 0.24, 0.95)
const SPENT := Color(0.35, 0.31, 0.28, 0.85)

var _draw_layer: Control
var _shown := PackedFloat32Array([0.0, 0.0, 0.0])
@export var settle := 9.0
@export var id := 1


func _ready() -> void:
	layer = 8
	_draw_layer = Control.new()
	_draw_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_draw_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_draw_layer.draw.connect(_draw_bars)
	add_child(_draw_layer)
	get_window().size_changed.connect(_draw_layer.queue_redraw)
	for i in 3:
		_shown[i] = Vitals.fraction(id, i as Vitals.Pool)


func _process(delta: float) -> void:
	if _draw_layer == null:
		return
	var moved := false
	for i in 3:
		var wanted := Vitals.fraction(id, i as Vitals.Pool)
		if is_equal_approx(_shown[i], wanted):
			continue
		_shown[i] = move_toward(_shown[i], wanted, settle * delta)
		moved = true
	if moved:
		_draw_layer.queue_redraw()


func _scale() -> float:
	return MenuStyle.ui_scale(get_viewport())


func _draw_bars() -> void:
	if not Vitals.running():
		return
	var scale := _scale()
	var size := BAR * scale
	var safe := MenuStyle.safe_insets(get_viewport())
	var at := Vector2(MARGIN.x * scale + safe.x, _draw_layer.size.y - MARGIN.y * scale - size.y - safe.w)
	var down := Vitals.is_down(id)
	var inks := [HEALTH, MANA, ENERGY]
	for i in range(2, -1, -1):
		var track := Rect2(at, size)
		_draw_layer.draw_rect(track, TRACK)
		var filled := Rect2(at, Vector2(size.x * clampf(_shown[i], 0.0, 1.0), size.y))
		if filled.size.x > 0.0:
			_draw_layer.draw_rect(filled, SPENT if down else inks[i])
		_draw_layer.draw_rect(track, EDGE, false, maxf(1.0 * scale, 1.0))
		at.y -= size.y + GAP * scale
