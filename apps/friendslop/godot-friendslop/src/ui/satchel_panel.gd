extends CanvasLayer


const CELL := 46.0
const GAP := 3.0
const PAD := 14.0
const CLOSE := 26.0
const HEAD := 30.0
const FOOT := 24.0
const ROUND := 8
const ICON_DIR := "res://assets/items/icons"
const TIP_WIDE := 260.0
const TIP_PAD := 10.0

@export var open_action := &"inventory"
@export var grid_color := Color(0.10, 0.09, 0.08, 0.80)
@export var cell_color := Color(0.20, 0.18, 0.15, 0.85)
@export var stack_color := Color(0.44, 0.35, 0.24, 0.95)
@export var held_color := Color(0.58, 0.47, 0.31, 0.85)
@export var edge_color := Color(0.05, 0.04, 0.03, 0.9)
@export var text_color := Color(0.94, 0.90, 0.82)
@export var drop_ok := Color(0.45, 0.72, 0.42, 0.45)
@export var drop_bad := Color(0.75, 0.30, 0.26, 0.45)
@export var close_color := Color(0.28, 0.24, 0.20, 0.90)
@export var close_hot_color := Color(0.62, 0.28, 0.24, 0.95)
@export var head_color := Color(0.16, 0.14, 0.12, 0.92)
@export var hover_color := Color(0.32, 0.29, 0.24, 0.90)
@export var faint_color := Color(0.66, 0.61, 0.53)
@export var tip_color := Color(0.07, 0.06, 0.05, 0.96)
@export var throw_color := Color(0.72, 0.52, 0.24, 0.95)

const RARITY := {
	&"common": Color(0.72, 0.70, 0.64),
	&"uncommon": Color(0.44, 0.76, 0.45),
	&"rare": Color(0.36, 0.58, 0.92),
	&"epic": Color(0.70, 0.42, 0.90),
	&"legendary": Color(0.94, 0.70, 0.28),
	&"mythic": Color(0.92, 0.36, 0.42),
}

var _root: Control
var _font: Font
var _was_captured := false
var _held := -1
var _grab := Vector2i.ZERO
var _mouse := Vector2.ZERO
var _close_hot := false
var _hover := -1
var _icons: Dictionary = {}


func _ready() -> void:
	layer = 12
	visible = false
	process_mode = Node.PROCESS_MODE_ALWAYS
	_font = ThemeDB.fallback_font
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.draw.connect(_draw_panel)
	add_child(_root)
	get_window().size_changed.connect(_root.queue_redraw)
	Journal.satchel_changed.connect(func(_items: Dictionary) -> void: _root.queue_redraw())


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(open_action):
		_toggle()
		get_viewport().set_input_as_handled()
		return
	if not visible:
		return
	if event.is_action_pressed(&"ui_cancel"):
		_close()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseMotion:
		_mouse = event.position
		var hot := _close_rect().has_point(_mouse)
		var over := _stack_under(_mouse)
		var changed := hot != _close_hot or over != _hover
		_close_hot = hot
		_hover = over
		if _held >= 0 or changed:
			_root.queue_redraw()
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_mouse = event.position
		if event.pressed:
			if _close_rect().has_point(_mouse):
				_close()
			else:
				_pick_up()
		else:
			_put_down()
		get_viewport().set_input_as_handled()


func _toggle() -> void:
	if visible:
		_close()
	else:
		_open()


func _open() -> void:
	_was_captured = Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if _was_captured:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_mouse = get_viewport().get_mouse_position()
	visible = true
	_root.queue_redraw()


func _close() -> void:
	_held = -1
	_close_hot = false
	_hover = -1
	visible = false
	if _was_captured:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _origin() -> Vector2:
	var span := Vector2(
			Journal.COLS * CELL + (Journal.COLS - 1) * GAP,
			Journal.ROWS * CELL + (Journal.ROWS - 1) * GAP)
	return ((_root.size - span) * 0.5).floor()


func _panel_rect() -> Rect2:
	var grid := _cell_rect(Vector2i.ZERO, Vector2i(Journal.COLS, Journal.ROWS)).grow(PAD)
	return Rect2(grid.position - Vector2(0.0, HEAD),
			grid.size + Vector2(0.0, HEAD + FOOT))


func _head_rect() -> Rect2:
	var panel := _panel_rect()
	return Rect2(panel.position, Vector2(panel.size.x, HEAD))


func _foot_rect() -> Rect2:
	var panel := _panel_rect()
	return Rect2(Vector2(panel.position.x, panel.end.y - FOOT), Vector2(panel.size.x, FOOT))


func _close_rect() -> Rect2:
	var head := _head_rect()
	return Rect2(Vector2(head.end.x - CLOSE - (HEAD - CLOSE) * 0.5,
			head.position.y + (HEAD - CLOSE) * 0.5), Vector2(CLOSE, CLOSE))


func _chrome_rect() -> Rect2:
	return _panel_rect()


func _cell_rect(at: Vector2i, size := Vector2i.ONE) -> Rect2:
	var origin := _origin()
	return Rect2(
			origin + Vector2(at.x * (CELL + GAP), at.y * (CELL + GAP)),
			Vector2(size.x * CELL + (size.x - 1) * GAP, size.y * CELL + (size.y - 1) * GAP))


func _cell_under(pos: Vector2) -> Vector2i:
	var local := (pos - _origin()) / (CELL + GAP)
	var at := Vector2i(floori(local.x), floori(local.y))
	if at.x < 0 or at.y < 0 or at.x >= Journal.COLS or at.y >= Journal.ROWS:
		return Vector2i(-1, -1)
	return at


func _stack_under(pos: Vector2) -> int:
	var cell := _cell_under(pos)
	if cell.x < 0:
		return -1
	return _stack_at(cell)


func _icon(ref: StringName) -> Texture2D:
	if _icons.has(ref):
		return _icons[ref]
	var path := "%s/%s.png" % [ICON_DIR, ref]
	var art: Texture2D = null
	if ResourceLoader.exists(path):
		art = load(path) as Texture2D
	_icons[ref] = art
	return art


func _rarity_of(ref: StringName) -> Color:
	var tier := StringName(Itemdb.item(ref).get("rarity", "common"))
	return RARITY.get(tier, RARITY[&"common"])


func _cells_used() -> int:
	var used := 0
	for stack in Journal.stacks():
		var size := Itemdb.grid_size(stack["ref"])
		used += size.x * size.y
	return used


func _weight_carried() -> float:
	var total := 0.0
	for stack in Journal.stacks():
		total += float(Itemdb.item(stack["ref"]).get("weight", 0.0)) * int(stack["count"])
	return total


func _stack_at(cell: Vector2i) -> int:
	var stacks := Journal.stacks()
	for i in stacks.size():
		var size := Itemdb.grid_size(stacks[i]["ref"])
		var x := int(stacks[i]["x"])
		var y := int(stacks[i]["y"])
		if cell.x >= x and cell.x < x + size.x and cell.y >= y and cell.y < y + size.y:
			return i
	return -1


func _pick_up() -> void:
	var cell := _cell_under(_mouse)
	if cell.x < 0:
		return
	var index := _stack_at(cell)
	if index < 0:
		return
	var stack := Journal.stacks()[index]
	_held = index
	_grab = cell - Vector2i(int(stack["x"]), int(stack["y"]))
	_root.queue_redraw()


func _put_down() -> void:
	if _held < 0:
		return
	var cell := _cell_under(_mouse)
	if cell.x >= 0:
		Journal.move_stack(_held, cell - _grab)
	elif not _chrome_rect().has_point(_mouse):
		_drop_to_world(_held)
	_held = -1
	_root.queue_redraw()


func _drop_to_world(index: int) -> void:
	var ground := GroundItems.of(get_tree())
	if ground == null:
		return
	var taken := Journal.remove_stack(index)
	if taken.is_empty():
		return
	var ref: StringName = taken["ref"]
	var count := int(taken["count"])
	if ground.drop_at_player(ref, count) == null:
		Journal.gain(ref, count)


func _draw_panel() -> void:
	_draw_frame()
	_draw_close()
	for y in Journal.ROWS:
		for x in Journal.COLS:
			_root.draw_style_box(_plate(cell_color, 4), _cell_rect(Vector2i(x, y)))

	var stacks := Journal.stacks()
	for i in stacks.size():
		if i == _held:
			continue
		_draw_stack(stacks[i], false, i == _hover)

	if _held >= 0 and _held < stacks.size():
		_draw_ghost(stacks[_held])
		_draw_stack(stacks[_held], true, false)
		if _throwing():
			_root.draw_string(_font, _mouse + Vector2(-60.0, 46.0), I18n.t("satchel.drop"),
					HORIZONTAL_ALIGNMENT_CENTER, 120.0, 13, throw_color)

	_draw_foot(stacks)
	if _held < 0 and _hover >= 0 and _hover < stacks.size():
		_draw_tip(stacks[_hover])


func _plate(fill: Color, radius: int, shadow := 0) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_corner_radius_all(radius)
	if shadow > 0:
		box.shadow_size = shadow
		box.shadow_color = Color(0.0, 0.0, 0.0, 0.45)
	return box


func _draw_frame() -> void:
	_root.draw_style_box(_plate(grid_color, ROUND, 10), _panel_rect())

	var head := _head_rect()
	var lid := _plate(head_color, ROUND)
	lid.corner_radius_bottom_left = 0
	lid.corner_radius_bottom_right = 0
	_root.draw_style_box(lid, head)
	_root.draw_string(_font, head.position + Vector2(PAD, HEAD * 0.5 + 6.0),
			I18n.t("satchel.title"), HORIZONTAL_ALIGNMENT_LEFT, head.size.x - PAD * 2.0 - CLOSE,
			15, text_color)


func _draw_foot(stacks: Array[Dictionary]) -> void:
	var foot := _foot_rect()
	var used := _cells_used()
	var left := I18n.t("satchel.cells").format({
		"used": used, "total": Journal.COLS * Journal.ROWS})
	if stacks.is_empty():
		left = I18n.t("satchel.empty")
	_root.draw_string(_font, foot.position + Vector2(PAD, FOOT * 0.5 + 5.0), left,
			HORIZONTAL_ALIGNMENT_LEFT, foot.size.x * 0.5, 13, faint_color)

	var weight := _weight_carried()
	if weight <= 0.0:
		return
	var right := I18n.t("satchel.weight").format({"weight": "%.1f" % weight})
	_root.draw_string(_font, foot.position + Vector2(PAD, FOOT * 0.5 + 5.0), right,
			HORIZONTAL_ALIGNMENT_RIGHT, foot.size.x - PAD * 2.0, 13, faint_color)


func _draw_close() -> void:
	var rect := _close_rect()
	_root.draw_style_box(_plate(close_hot_color if _close_hot else close_color, 5), rect)
	var glyph := "x"
	var span := _font.get_string_size(glyph, HORIZONTAL_ALIGNMENT_LEFT, -1.0, 16)
	_root.draw_string(_font, rect.position + Vector2((rect.size.x - span.x) * 0.5,
			(rect.size.y + span.y) * 0.5 - 3.0), glyph, HORIZONTAL_ALIGNMENT_LEFT, -1.0, 16,
			text_color)


func _draw_tip(stack: Dictionary) -> void:
	var ref: StringName = stack["ref"]
	var label := Itemdb.display_name(ref)
	var body := String(Itemdb.item(ref).get("description", "")).strip_edges()
	var count := int(stack["count"])

	var wrapped := _font.get_multiline_string_size(body, HORIZONTAL_ALIGNMENT_LEFT,
			TIP_WIDE - TIP_PAD * 2.0, 12)
	var high := TIP_PAD * 2.0 + 20.0 + (wrapped.y + 6.0 if body != "" else 0.0)
	var at := _mouse + Vector2(18.0, 18.0)
	at.x = minf(at.x, _root.size.x - TIP_WIDE - 8.0)
	at.y = minf(at.y, _root.size.y - high - 8.0)
	var card := Rect2(at, Vector2(TIP_WIDE, high))

	_root.draw_style_box(_plate(tip_color, 6, 8), card)
	_root.draw_rect(card, _rarity_of(ref), false, 2.0)

	var head := label if count <= 1 else "%s  ×%d" % [label, count]
	_root.draw_string(_font, card.position + Vector2(TIP_PAD, TIP_PAD + 13.0), head,
			HORIZONTAL_ALIGNMENT_LEFT, TIP_WIDE - TIP_PAD * 2.0, 14, _rarity_of(ref))
	if body == "":
		return
	_root.draw_multiline_string(_font, card.position + Vector2(TIP_PAD, TIP_PAD + 33.0), body,
			HORIZONTAL_ALIGNMENT_LEFT, TIP_WIDE - TIP_PAD * 2.0, 12, -1, faint_color)


func _draw_ghost(stack: Dictionary) -> void:
	var cell := _cell_under(_mouse)
	if cell.x < 0:
		return
	var size := Itemdb.grid_size(stack["ref"])
	var at := cell - _grab
	var ok := Journal.can_place(_held, at)
	var rect := _cell_rect(Vector2i(maxi(at.x, 0), maxi(at.y, 0)), size)
	_root.draw_rect(rect, drop_ok if ok else drop_bad)


func _draw_stack(stack: Dictionary, held: bool, hot: bool) -> void:
	var ref: StringName = stack["ref"]
	var size := Itemdb.grid_size(ref)
	var rect := _cell_rect(Vector2i(int(stack["x"]), int(stack["y"])), size)
	if held:
		rect.position = _mouse - Vector2(_grab) * (CELL + GAP) - Vector2(CELL, CELL) * 0.5

	var fill := stack_color
	if held:
		fill = throw_color if _throwing() else held_color
	elif hot:
		fill = hover_color
	_root.draw_style_box(_plate(fill, 5, 6 if held else 0), rect)
	_root.draw_rect(rect, _rarity_of(ref) if hot or held else edge_color, false, 2.0)

	var art := _icon(ref)
	if art != null:
		_draw_icon(art, rect)
	else:
		_root.draw_string(_font, rect.position + Vector2(6.0, 18.0), Itemdb.display_name(ref),
				HORIZONTAL_ALIGNMENT_LEFT, rect.size.x - 10.0, 12, text_color)

	var count := int(stack["count"])
	if count > 1:
		_root.draw_string(_font, rect.position + Vector2(4.0, rect.size.y - 5.0), str(count),
				HORIZONTAL_ALIGNMENT_RIGHT, rect.size.x - 8.0, 14, text_color)


func _throwing() -> bool:
	return _held >= 0 and _cell_under(_mouse).x < 0 and not _chrome_rect().has_point(_mouse)


func _draw_icon(art: Texture2D, rect: Rect2) -> void:
	var box := rect.grow(-5.0)
	var art_size := Vector2(art.get_size())
	if art_size.x <= 0.0 or art_size.y <= 0.0:
		return
	var fit := minf(box.size.x / art_size.x, box.size.y / art_size.y)
	var drawn := art_size * fit
	_root.draw_texture_rect(art, Rect2(box.position + (box.size - drawn) * 0.5, drawn), false)
