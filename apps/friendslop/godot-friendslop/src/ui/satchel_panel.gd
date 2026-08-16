extends CanvasLayer

## The bag, as a grid you can rearrange.
##
## Stacks occupy whole rectangles rather than single slots, so where a thing sits is part
## of what the player owns and a full bag is a question of shape as well as of number.
## The journal holds all of that; this only draws it and hands moves back.
##
## Deliberately not a pause. The world carries on behind an open bag, which is what makes
## deciding whether to keep chopping a decision rather than a menu.

const CELL := 46.0
const GAP := 3.0
const PAD := 14.0

@export var open_action := &"inventory"
@export var grid_color := Color(0.10, 0.09, 0.08, 0.80)
@export var cell_color := Color(0.20, 0.18, 0.15, 0.85)
@export var stack_color := Color(0.44, 0.35, 0.24, 0.95)
@export var held_color := Color(0.58, 0.47, 0.31, 0.85)
@export var edge_color := Color(0.05, 0.04, 0.03, 0.9)
@export var text_color := Color(0.94, 0.90, 0.82)
## Where a stack would land, when that is somewhere it may land.
@export var drop_ok := Color(0.45, 0.72, 0.42, 0.45)
@export var drop_bad := Color(0.75, 0.30, 0.26, 0.45)

var _root: Control
var _font: Font
var _was_captured := false
## Index into the journal's stacks, or -1 when nothing is being carried.
var _held := -1
## Where in the held stack the grab happened, so it does not jump to its own corner.
var _grab := Vector2i.ZERO
var _mouse := Vector2.ZERO


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
	# Closing with the same key that closes everything else, but only when this is the
	# thing on top: a dialogue or a pause menu over it has the better claim.
	if event.is_action_pressed(&"ui_cancel"):
		_close()
		get_viewport().set_input_as_handled()
		return
	if event is InputEventMouseMotion:
		_mouse = event.position
		if _held >= 0:
			_root.queue_redraw()
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_mouse = event.position
		if event.pressed:
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
	# Remembered rather than assumed, so closing the bag on a menu that already had the
	# cursor free does not steal it back into the camera.
	_was_captured = Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if _was_captured:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_mouse = get_viewport().get_mouse_position()
	visible = true
	_root.queue_redraw()


func _close() -> void:
	# Anything still in hand goes back where it came from. The journal was never told
	# about the move, so there is nothing to undo -- only a redraw.
	_held = -1
	visible = false
	if _was_captured:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _origin() -> Vector2:
	var span := Vector2(
			Journal.COLS * CELL + (Journal.COLS - 1) * GAP,
			Journal.ROWS * CELL + (Journal.ROWS - 1) * GAP)
	return ((_root.size - span) * 0.5).floor()


func _cell_rect(at: Vector2i, size := Vector2i.ONE) -> Rect2:
	var origin := _origin()
	return Rect2(
			origin + Vector2(at.x * (CELL + GAP), at.y * (CELL + GAP)),
			Vector2(size.x * CELL + (size.x - 1) * GAP, size.y * CELL + (size.y - 1) * GAP))


## Which cell the cursor is over, or (-1, -1) when it is off the board.
func _cell_under(pos: Vector2) -> Vector2i:
	var local := (pos - _origin()) / (CELL + GAP)
	var at := Vector2i(floori(local.x), floori(local.y))
	if at.x < 0 or at.y < 0 or at.x >= Journal.COLS or at.y >= Journal.ROWS:
		return Vector2i(-1, -1)
	return at


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
		# Refused moves are simply not made. The stack stays where it was, which is what
		# the redraw below shows, so a bad drop reads as the item not going there rather
		# than as anything having gone wrong.
		Journal.move_stack(_held, cell - _grab)
	_held = -1
	_root.queue_redraw()


func _draw_panel() -> void:
	var span := _cell_rect(Vector2i.ZERO, Vector2i(Journal.COLS, Journal.ROWS))
	_root.draw_rect(span.grow(PAD), grid_color)
	for y in Journal.ROWS:
		for x in Journal.COLS:
			_root.draw_rect(_cell_rect(Vector2i(x, y)), cell_color)

	var stacks := Journal.stacks()
	for i in stacks.size():
		if i == _held:
			continue
		_draw_stack(stacks[i], false)

	if _held >= 0 and _held < stacks.size():
		_draw_ghost(stacks[_held])
		_draw_stack(stacks[_held], true)


## Where the held stack would land, coloured by whether it may land there.
func _draw_ghost(stack: Dictionary) -> void:
	var cell := _cell_under(_mouse)
	if cell.x < 0:
		return
	var size := Itemdb.grid_size(stack["ref"])
	var at := cell - _grab
	var ok := Journal.can_place(_held, at)
	var rect := _cell_rect(Vector2i(maxi(at.x, 0), maxi(at.y, 0)), size)
	_root.draw_rect(rect, drop_ok if ok else drop_bad)


func _draw_stack(stack: Dictionary, held: bool) -> void:
	var ref: StringName = stack["ref"]
	var size := Itemdb.grid_size(ref)
	var rect := _cell_rect(Vector2i(int(stack["x"]), int(stack["y"])), size)
	if held:
		# Drawn under the cursor rather than in its cell, so the bag reads as something
		# being carried across it.
		rect.position = _mouse - Vector2(_grab) * (CELL + GAP) - Vector2(CELL, CELL) * 0.5
	_root.draw_rect(rect, held_color if held else stack_color)
	_root.draw_rect(rect, edge_color, false, 2.0)

	var label := Itemdb.display_name(ref)
	_root.draw_string(_font, rect.position + Vector2(6.0, 18.0), label,
			HORIZONTAL_ALIGNMENT_LEFT, rect.size.x - 10.0, 12, text_color)
	var count := int(stack["count"])
	if count > 1:
		_root.draw_string(_font, rect.position + rect.size - Vector2(6.0, 6.0), str(count),
				HORIZONTAL_ALIGNMENT_RIGHT, 0.0, 14, text_color)
