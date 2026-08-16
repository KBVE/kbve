extends CanvasLayer

## Short-lived messages, stacked, from anywhere.
##
## The one thing that existed before this was OnlineHud.show_notice: a single Label on a
## scene only the online mode loads, which meant single player had no way to tell the
## player anything and a second message overwrote the first mid-read.
##
## Lives above the pause menu and runs while the tree is paused, since the things worth
## saying -- a save, a failure, a setting that could not be applied -- happen either side
## of opening the book.

const MAX_SHOWN := 4
const SECONDS := 3.2
const FADE := 0.45
const GAP := 8

## Authored against a 720-tall viewport, like the touch HUD, so a phone gets the same
## layout rather than the same pixel counts.
const LAYOUT_HEIGHT := 720.0
const SCALE_RANGE := Vector2(0.7, 1.4)

enum Kind { INFO, GOOD, WARN }

const INK := {
	Kind.INFO: Color(0.25, 0.16, 0.08),
	Kind.GOOD: Color(0.13, 0.32, 0.14),
	Kind.WARN: Color(0.50, 0.16, 0.06),
}

var _column: VBoxContainer


func _ready() -> void:
	layer = 130
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_column = VBoxContainer.new()
	_column.alignment = BoxContainer.ALIGNMENT_END
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.add_theme_constant_override("separation", GAP)
	# Anchored to the bottom centre and grown upward: the corners are where the touch HUD
	# and the debug readout already live, and a toast that lands under a thumb is a toast
	# nobody reads.
	_column.anchor_left = 0.5
	_column.anchor_right = 0.5
	_column.anchor_top = 1.0
	_column.anchor_bottom = 1.0
	_column.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_column.grow_vertical = Control.GROW_DIRECTION_BEGIN
	root.add_child(_column)
	_reflow()
	get_viewport().size_changed.connect(_reflow)


func info(text: String) -> void:
	show_toast(text, Kind.INFO)


func good(text: String) -> void:
	show_toast(text, Kind.GOOD)


func warn(text: String) -> void:
	show_toast(text, Kind.WARN)


## Oldest goes first when the stack is full, rather than refusing the new one: the message
## that just arrived is the one the player is looking for.
func show_toast(text: String, kind: int = Kind.INFO, seconds: float = SECONDS) -> void:
	if _column == null or text.strip_edges() == "":
		return
	while _column.get_child_count() >= MAX_SHOWN:
		var oldest := _column.get_child(0)
		_column.remove_child(oldest)
		oldest.queue_free()

	var scale := _scale()
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", int(round(18.0 * scale)))
	label.add_theme_color_override("font_color", INK.get(kind, INK[Kind.INFO]))
	label.add_theme_stylebox_override("normal", _paper(scale))
	_column.add_child(label)

	var tw := create_tween()
	tw.tween_property(label, "modulate:a", 1.0, 0.12).from(0.0)
	tw.tween_interval(maxf(seconds, 0.2))
	tw.tween_property(label, "modulate:a", 0.0, FADE)
	tw.tween_callback(label.queue_free)


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


func _reflow() -> void:
	if _column == null:
		return
	var scale := _scale()
	_column.offset_bottom = -90.0 * scale
	_column.offset_left = -260.0 * scale
	_column.offset_right = 260.0 * scale
