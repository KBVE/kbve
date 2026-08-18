extends CanvasLayer


const MAX_SHOWN := 4
const SECONDS := 3.2
const FADE := 0.45
const RISE := 0.12
const GAP := 8

const LAYOUT_HEIGHT := 720.0
const SCALE_RANGE := Vector2(0.7, 1.4)
const FONT := 18.0

enum Kind { INFO, GOOD, WARN }

## Where the stack sits. In the world it rises from the bottom middle, under the player's
## eye but clear of the HUD; on the title there is nothing in the top right and plenty in
## the middle, so it moves out of the menu's way.
enum Corner { BOTTOM_CENTER, TOP_RIGHT }

const EDGE_PAD := 18.0
const COLUMN_WIDTH := 320.0

const INK := {
	Kind.INFO: Color(0.25, 0.16, 0.08),
	Kind.GOOD: Color(0.13, 0.32, 0.14),
	Kind.WARN: Color(0.50, 0.16, 0.06),
}

var _column: VBoxContainer
var _lines: Array[Dictionary] = []
var _corner := Corner.BOTTOM_CENTER


func _ready() -> void:
	layer = 130
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_column = VBoxContainer.new()
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.add_theme_constant_override("separation", GAP)
	root.add_child(_column)
	_reflow()
	get_viewport().size_changed.connect(_reflow)
	Journal.gained.connect(_on_gained)
	Journal.refused.connect(_on_refused)


func info(text: String) -> void:
	show_toast(text, Kind.INFO)


func good(text: String) -> void:
	show_toast(text, Kind.GOOD)


func warn(text: String) -> void:
	show_toast(text, Kind.WARN)


func show_toast(text: String, kind: int = Kind.INFO, seconds: float = SECONDS) -> void:
	if _column == null or text.strip_edges() == "":
		return
	var again := _repeat(text, seconds)
	if again:
		return

	while _lines.size() >= MAX_SHOWN:
		_retire(_lines[0], true)

	var scale := _scale()
	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.horizontal_alignment = _text_align()
	label.add_theme_font_size_override("font_size", int(round(FONT * scale)))
	label.add_theme_color_override("font_color", INK.get(kind, INK[Kind.INFO]))
	label.add_theme_stylebox_override("normal", _paper(scale))
	_column.add_child(label)

	var line := {"text": text, "kind": kind, "times": 1, "label": label, "tween": null}
	label.text = text
	_lines.append(line)
	_wind(line, seconds)


func lines() -> Array[Dictionary]:
	_forget_freed()
	return _lines.duplicate()


func clear() -> void:
	for line in _lines.duplicate():
		_retire(line, true)


func _repeat(text: String, seconds: float) -> bool:
	_forget_freed()
	for line in _lines:
		if str(line["text"]) != text:
			continue
		line["times"] = int(line["times"]) + 1
		(line["label"] as Label).text = "%s  ×%d" % [text, int(line["times"])]
		_wind(line, seconds)
		return true
	return false


func _wind(line: Dictionary, seconds: float) -> void:
	var previous: Variant = line.get("tween", null)
	if previous is Tween and (previous as Tween).is_valid():
		(previous as Tween).kill()
	var label: Label = line["label"]
	var tw := create_tween()
	line["tween"] = tw
	tw.tween_property(label, "modulate:a", 1.0, RISE).from(label.modulate.a)
	tw.tween_interval(maxf(seconds, 0.2))
	tw.tween_property(label, "modulate:a", 0.0, FADE)
	tw.tween_callback(func() -> void: _retire(line))


func _retire(line: Dictionary, now := false) -> void:
	var at := _lines.find(line)
	if at >= 0:
		_lines.remove_at(at)
	var tween: Variant = line.get("tween", null)
	if tween is Tween and (tween as Tween).is_valid():
		(tween as Tween).kill()
	var label: Variant = line.get("label", null)
	if label is not Label or not is_instance_valid(label):
		return
	_column.remove_child(label)
	if now:
		(label as Label).free()
	else:
		(label as Label).queue_free()


func _forget_freed() -> void:
	_lines = _lines.filter(func(line: Dictionary) -> bool:
		var label: Variant = line.get("label", null)
		return label is Label and is_instance_valid(label))


func _on_gained(ref: StringName, count: int, _total: int) -> void:
	good(I18n.t("toast.gained", {"count": str(count), "item": Itemdb.display_name(ref)}))


func _on_refused(ref: StringName, count: int) -> void:
	warn(I18n.t("toast.no_room", {"count": str(count), "item": Itemdb.display_name(ref)}))


func _paper(scale: float) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = MenuStyle.PAPER
	style.set_corner_radius_all(MenuStyle.BUTTON_RADIUS)
	style.content_margin_left = 18.0 * scale
	style.content_margin_right = 18.0 * scale
	style.content_margin_top = 8.0 * scale
	style.content_margin_bottom = 8.0 * scale
	return style


func _scale() -> float:
	var h := float(get_viewport().get_visible_rect().size.y)
	if h <= 0.0:
		return 1.0
	return clampf(h / LAYOUT_HEIGHT, SCALE_RANGE.x, SCALE_RANGE.y)


## Moves the stack to a corner. Existing lines move with it rather than being cleared, so
## a message raised a moment before a scene change is still readable after it.
func place(corner: int) -> void:
	if _corner == corner:
		return
	_corner = corner
	_reflow()
	for line in _lines:
		var label: Variant = line.get("label", null)
		if label is Label:
			(label as Label).horizontal_alignment = _text_align()


func corner() -> int:
	return _corner


func _text_align() -> int:
	return HORIZONTAL_ALIGNMENT_RIGHT if _corner == Corner.TOP_RIGHT \
			else HORIZONTAL_ALIGNMENT_CENTER


func _reflow() -> void:
	if _column == null:
		return
	var scale := _scale()
	var width := COLUMN_WIDTH * scale
	var pad := EDGE_PAD * scale
	if _corner == Corner.TOP_RIGHT:
		_column.alignment = BoxContainer.ALIGNMENT_BEGIN
		_column.anchor_left = 1.0
		_column.anchor_right = 1.0
		_column.anchor_top = 0.0
		_column.anchor_bottom = 0.0
		_column.grow_horizontal = Control.GROW_DIRECTION_BEGIN
		_column.grow_vertical = Control.GROW_DIRECTION_END
		_column.offset_left = -(width + pad)
		_column.offset_right = -pad
		_column.offset_top = pad
		_column.offset_bottom = pad
		return
	_column.alignment = BoxContainer.ALIGNMENT_END
	_column.anchor_left = 0.5
	_column.anchor_right = 0.5
	_column.anchor_top = 1.0
	_column.anchor_bottom = 1.0
	_column.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_column.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_column.offset_top = 0.0
	_column.offset_bottom = -90.0 * scale
	_column.offset_left = -260.0 * scale
	_column.offset_right = 260.0 * scale
