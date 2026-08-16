extends CanvasLayer

## Short-lived notices, stacked above the crosshair.
##
## What arrived and what would not fit. The second of those is the one that matters: loot
## that bounces off a full bag has to be loud, because the alternative is a felled tree
## and no reason given.
##
## Repeats merge rather than queue. Chopping is a stream of small drops and a column of
## eight "+1 Log" lines is less readable than one that says how many -- and a player stood
## on a drop their bag will not take should be told once, not once a second.

const SECONDS := 3.5
const FADE := 0.6
const WIDTH := 340.0
const LINE := 28.0
const PAD := 10.0

const INK := Color(0.97, 0.94, 0.85)
const WARN := Color(1.0, 0.72, 0.55)
const BACK := Color(0.08, 0.07, 0.06, 0.72)

var _root: Control
var _font: Font
## Each `{text, color, left, times}`, newest last.
var _lines: Array[Dictionary] = []


func _ready() -> void:
	layer = 95
	process_mode = Node.PROCESS_MODE_ALWAYS
	_font = ThemeDB.fallback_font
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.draw.connect(_draw_lines)
	add_child(_root)
	get_window().size_changed.connect(_root.queue_redraw)
	Journal.gained.connect(_on_gained)
	Journal.refused.connect(_on_refused)


## Says something. An identical line already up is refreshed and counted rather than
## repeated, so the stack stays as short as what it has to say.
func show_toast(text: String, warn := false) -> void:
	if text == "":
		return
	for line in _lines:
		if line["text"] == text:
			line["times"] = int(line["times"]) + 1
			line["left"] = SECONDS
			_root.queue_redraw()
			return
	_lines.append({"text": text, "color": WARN if warn else INK, "left": SECONDS, "times": 1})
	_root.queue_redraw()


func lines() -> Array[Dictionary]:
	return _lines.duplicate(true)


func _on_gained(ref: StringName, count: int, _total: int) -> void:
	show_toast(I18n.t("toast.gained", {"count": count, "item": Itemdb.display_name(ref)}))


func _on_refused(ref: StringName, count: int) -> void:
	show_toast(I18n.t("toast.no_room", {"count": count, "item": Itemdb.display_name(ref)}), true)


func _process(delta: float) -> void:
	if _lines.is_empty():
		return
	for line in _lines:
		line["left"] = float(line["left"]) - delta
	var before := _lines.size()
	_lines = _lines.filter(func(l: Dictionary) -> bool: return float(l["left"]) > 0.0)
	if _lines.size() != before:
		_root.queue_redraw()
	elif not _lines.is_empty():
		_root.queue_redraw()


func _draw_lines() -> void:
	var origin := Vector2((_root.size.x - WIDTH) * 0.5, _root.size.y * 0.62)
	for i in _lines.size():
		var line := _lines[i]
		var alpha: float = clampf(float(line["left"]) / FADE, 0.0, 1.0)
		var at := origin + Vector2(0.0, i * (LINE + 4.0))
		var box := Rect2(at, Vector2(WIDTH, LINE))
		_root.draw_rect(box, Color(BACK.r, BACK.g, BACK.b, BACK.a * alpha))
		var text: String = line["text"]
		var times := int(line["times"])
		if times > 1:
			text = "%s  ×%d" % [text, times]
		var tint: Color = line["color"]
		_root.draw_string(_font, at + Vector2(PAD, LINE - 8.0), text,
				HORIZONTAL_ALIGNMENT_LEFT, WIDTH - PAD * 2.0, 15,
				Color(tint.r, tint.g, tint.b, alpha))
