extends Control


const STICK_RADIUS := 110.0
const STICK_DEADZONE := 12.0
const KNOB_RADIUS := 42.0
const LOOK_RATE := 2.6
const BUTTON_RADIUS := 74.0

const MOVE_ACTIONS := {
	"move_left": Vector2(-1.0, 0.0),
	"move_right": Vector2(1.0, 0.0),
	"move_forward": Vector2(0.0, -1.0),
	"move_back": Vector2(0.0, 1.0),
}

const LAYOUT_HEIGHT := 720.0
const LAYOUT_SCALE_RANGE := Vector2(0.55, 1.5)

const BUTTONS := [
	{"action": "jump", "label": "JUMP", "anchor": Vector2(1.0, 1.0), "offset": Vector2(-110.0, -150.0), "radius": 64.0},
	{"action": "harvest", "label": "HIT", "anchor": Vector2(1.0, 1.0), "offset": Vector2(-245.0, -195.0), "radius": 58.0},
	{"action": "interact", "label": "USE", "anchor": Vector2(1.0, 1.0), "offset": Vector2(-125.0, -290.0), "radius": 58.0},
	{"action": "crouch", "label": "DUCK", "anchor": Vector2(1.0, 1.0), "offset": Vector2(-375.0, -140.0), "radius": 54.0},
	{"action": "roll", "label": "ROLL", "anchor": Vector2(1.0, 1.0), "offset": Vector2(-268.0, -340.0), "radius": 54.0},
	{"action": "block", "label": "GUARD", "anchor": Vector2(1.0, 1.0), "offset": Vector2(-400.0, -280.0), "radius": 54.0},
	{"action": "inventory", "label": "BAG", "anchor": Vector2(1.0, 0.0), "offset": Vector2(-90.0, 310.0), "radius": 48.0},
	{"action": "debug_hud", "label": "HUD", "anchor": Vector2(1.0, 0.0), "offset": Vector2(-90.0, 90.0), "radius": 48.0},
	{"action": "", "label": "MENU", "anchor": Vector2(1.0, 0.0), "offset": Vector2(-90.0, 200.0), "radius": 48.0},
]

var look_delta := Vector2.ZERO

var _move := {"finger": -1, "origin": Vector2.ZERO, "position": Vector2.ZERO}
var _look := {"finger": -1, "origin": Vector2.ZERO, "position": Vector2.ZERO}
var _button_fingers := {}


func _ready() -> void:
	add_to_group("touch_controls")
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var touch := DisplayServer.is_touchscreen_available()
	visible = touch
	set_process_unhandled_input(touch)
	set_process(touch)


func consume_look() -> Vector2:
	var delta := look_delta
	look_delta = Vector2.ZERO
	return delta


func _process(delta: float) -> void:
	if _look.finger == -1:
		return
	look_delta += _stick_vector(_look) * LOOK_RATE * delta


func _ui_scale() -> float:
	if size.y <= 0.0:
		return 1.0
	return clampf(size.y / LAYOUT_HEIGHT, LAYOUT_SCALE_RANGE.x, LAYOUT_SCALE_RANGE.y)


func _button_center(button: Dictionary) -> Vector2:
	return size * button.anchor + button.offset * _ui_scale()


func _button_radius(button: Dictionary) -> float:
	return button.radius * _ui_scale()


func _stick_vector(stick: Dictionary) -> Vector2:
	var scale := _ui_scale()
	var offset: Vector2 = stick.position - stick.origin
	if offset.length() <= STICK_DEADZONE * scale:
		return Vector2.ZERO
	var reach := STICK_RADIUS * scale
	return offset.limit_length(reach) / reach


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			_begin_touch(event.index, event.position)
		else:
			_end_touch(event.index)
	elif event is InputEventScreenDrag:
		_drag_touch(event.index, event.position)


func _begin_touch(index: int, position: Vector2) -> void:
	for button in BUTTONS:
		if position.distance_to(_button_center(button)) <= _button_radius(button):
			if button.action == "":
				for menu in get_tree().get_nodes_in_group(&"pause_menu"):
					menu.toggle()
					break
				return
			if _button_fingers.values().has(button.action):
				return
			_button_fingers[index] = button.action
			Input.action_press(button.action)
			queue_redraw()
			return
	var stick: Dictionary = _move if position.x < size.x * 0.5 else _look
	if stick.finger != -1:
		return
	stick.finger = index
	stick.origin = position
	stick.position = position
	queue_redraw()


func _drag_touch(index: int, position: Vector2) -> void:
	if _move.finger == index:
		_move.position = position
		_apply_move()
		queue_redraw()
	elif _look.finger == index:
		_look.position = position
		queue_redraw()


func _end_touch(index: int) -> void:
	if _button_fingers.has(index):
		Input.action_release(_button_fingers[index])
		_button_fingers.erase(index)
		queue_redraw()
		return
	if _move.finger == index:
		_move.finger = -1
		_release_move_actions()
		queue_redraw()
	elif _look.finger == index:
		_look.finger = -1
		queue_redraw()


func _apply_move() -> void:
	var vector := _stick_vector(_move)
	if vector == Vector2.ZERO:
		_release_move_actions()
		return
	for action in MOVE_ACTIONS:
		var strength := clampf(vector.dot(MOVE_ACTIONS[action]), 0.0, 1.0)
		if strength > 0.0:
			Input.action_press(action, strength)
		else:
			Input.action_release(action)


func _release_move_actions() -> void:
	for action in MOVE_ACTIONS:
		Input.action_release(action)


func _draw_stick(stick: Dictionary, idle_center: Vector2) -> void:
	var scale := _ui_scale()
	var reach := STICK_RADIUS * scale
	var knob_r := KNOB_RADIUS * scale
	if stick.finger == -1:
		draw_arc(idle_center, reach, 0.0, TAU, 48, Color(1.0, 1.0, 1.0, 0.12), 3.0)
		draw_circle(idle_center, knob_r, Color(1.0, 1.0, 1.0, 0.10))
		return
	draw_arc(stick.origin, reach, 0.0, TAU, 48, Color(1.0, 1.0, 1.0, 0.30), 3.0)
	var knob: Vector2 = stick.origin + (stick.position - stick.origin).limit_length(reach)
	draw_circle(knob, knob_r, Color(1.0, 1.0, 1.0, 0.35))


func _draw() -> void:
	var font := ThemeDB.fallback_font
	var scale := _ui_scale()
	var font_size := int(round(22.0 * scale))
	for button in BUTTONS:
		var center := _button_center(button)
		var radius := _button_radius(button)
		var held: bool = button.action != "" and _button_fingers.values().has(button.action)
		draw_circle(center, radius, Color(1.0, 1.0, 1.0, 0.22 if held else 0.10))
		draw_arc(center, radius, 0.0, TAU, 40, Color(1.0, 1.0, 1.0, 0.35), 3.0)
		var width := font.get_string_size(button.label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		draw_string(font, center + Vector2(-width * 0.5, font_size * 0.36), button.label,
				HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color(1.0, 1.0, 1.0, 0.75))
	var inset := 200.0 * scale
	_draw_stick(_move, Vector2(inset, size.y - inset))
	_draw_stick(_look, Vector2(size.x - inset, size.y - inset))
