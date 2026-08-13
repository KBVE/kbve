extends Control

## Dual stick layout.

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

## Anchors are fractions of the viewport so the layout survives rotation and differing
## device aspects.
const BUTTONS := [
	{"action": "jump", "label": "JUMP", "anchor": Vector2(1.0, 1.0), "offset": Vector2(-200.0, -430.0), "radius": 74.0},
	{"action": "debug_hud", "label": "HUD", "anchor": Vector2(1.0, 0.0), "offset": Vector2(-90.0, 90.0), "radius": 48.0},
	{"action": "", "label": "BISECT", "anchor": Vector2(1.0, 0.0), "offset": Vector2(-90.0, 200.0), "radius": 48.0},
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


## Returns the accumulated look movement and clears it, so a frame that runs long cannot
## replay the same input twice.
func consume_look() -> Vector2:
	var delta := look_delta
	look_delta = Vector2.ZERO
	return delta


func _process(delta: float) -> void:
	if _look.finger == -1:
		return
	look_delta += _stick_vector(_look) * LOOK_RATE * delta


func _button_center(button: Dictionary) -> Vector2:
	return size * button.anchor + button.offset


func _stick_vector(stick: Dictionary) -> Vector2:
	var offset: Vector2 = stick.position - stick.origin
	if offset.length() <= STICK_DEADZONE:
		return Vector2.ZERO
	return offset.limit_length(STICK_RADIUS) / STICK_RADIUS


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
		if position.distance_to(_button_center(button)) <= button.radius:
			if button.action == "":
				var main := get_tree().current_scene
				if main and main.has_method("cycle_bisect"):
					main.cycle_bisect()
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
	if stick.finger == -1:
		draw_arc(idle_center, STICK_RADIUS, 0.0, TAU, 48, Color(1.0, 1.0, 1.0, 0.12), 3.0)
		draw_circle(idle_center, KNOB_RADIUS, Color(1.0, 1.0, 1.0, 0.10))
		return
	draw_arc(stick.origin, STICK_RADIUS, 0.0, TAU, 48, Color(1.0, 1.0, 1.0, 0.30), 3.0)
	var knob: Vector2 = stick.origin + (stick.position - stick.origin).limit_length(STICK_RADIUS)
	draw_circle(knob, KNOB_RADIUS, Color(1.0, 1.0, 1.0, 0.35))


func _draw() -> void:
	var font := ThemeDB.fallback_font
	for button in BUTTONS:
		var center := _button_center(button)
		var held := _button_fingers.values().has(button.action)
		draw_circle(center, button.radius, Color(1.0, 1.0, 1.0, 0.22 if held else 0.10))
		draw_arc(center, button.radius, 0.0, TAU, 40, Color(1.0, 1.0, 1.0, 0.35), 3.0)
		var width := font.get_string_size(button.label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x
		draw_string(font, center + Vector2(-width * 0.5, 8.0), button.label,
				HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(1.0, 1.0, 1.0, 0.75))
	_draw_stick(_move, Vector2(200.0, size.y - 200.0))
	_draw_stick(_look, Vector2(size.x - 200.0, size.y - 200.0))
