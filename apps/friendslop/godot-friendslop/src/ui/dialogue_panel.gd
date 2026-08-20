class_name DialoguePanel
extends CanvasLayer


const PaperButton := preload("res://src/ui/components/paper_button.gd")
const RunnerScript := preload("res://src/dialogue/dialogue_runner.gd")
const Hint := preload("res://src/ui/input_hint.gd")

signal closed
signal speaking
signal listening

const MAX_WIDTH := 880.0
const SIDE_UV := 0.05
const SIDE_BIAS := 0.35
const SIDE_RANGE := Vector2(16.0, 90.0)
const BOTTOM_UV := 0.035
const BOTTOM_RANGE := Vector2(12.0, 44.0)
const TOP_UV := 0.16
const MIN_HEIGHT_UV := 0.2
const MIN_HEIGHT_RANGE := Vector2(120.0, 240.0)
const TOUCH_FONT := 1.15
const TOUCH_REPLY_MIN_H := 52.0
const TOUCH_CLOSE := 46.0
const BACKDROP := Color(0.10, 0.075, 0.055, 0.86)
const DIM := Color(0.06, 0.045, 0.035, 0.38)
const ENTER_TIME := 0.16
const ENTER_RISE := 26.0
const REPLY_KEYS := 9
const NAME_FONT := 26
const LINE_FONT := 20
const CLOSE_FONT := 22
const CLOSE_SIZE := 34.0
const HINT_FONT := 14

const TYPING_SPEED := 52.0
const PAUSE_AFTER := {".": 0.18, "?": 0.18, "!": 0.18, ",": 0.08, ";": 0.1, ":": 0.1, "—": 0.12}

static var _open: DialoguePanel = null

var runner: DialogueRunner

var _root: Control
var _shell: MarginContainer
var _frame: PanelContainer
var _name_label: Label
var _line_label: Label
var _choices: VBoxContainer
var _hint: Label
var _close: Button
var _floor := MIN_HEIGHT_RANGE.x
var _reply_min_h := MenuStyle.REPLY_MIN_H
var _reply_fill := false
var _was_captured := false
var _closing := false
var _pulse := 0.0

var _written := 0.0
var _letters := 0
var _held := 0.0
var _pending := -1
var _player := ""


static func is_open() -> bool:
	return _open != null and is_instance_valid(_open)


static func open(tree: SceneTree, graph: DialogueGraph, state: DialogueState) -> DialoguePanel:
	if is_open():
		return null
	var panel := DialoguePanel.new()
	panel.name = "DialoguePanel"
	panel.runner = RunnerScript.new()
	var host: Node = tree.current_scene if tree.current_scene != null else tree.root
	host.add_child(panel)
	if not panel.runner.start(graph, state):
		panel.queue_free()
		return null
	_open = panel
	panel._show_node()
	return panel


func _init() -> void:
	layer = 120
	process_mode = Node.PROCESS_MODE_ALWAYS


func _ready() -> void:
	_build()
	_player = speaker_name()
	runner.line_changed.connect(_show_node)
	runner.finished.connect(close)
	I18n.locale_changed.connect(retranslate)
	_was_captured = Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if _was_captured:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_set_crosshair(false)
	_enter()


func _enter() -> void:
	_root.modulate.a = 0.0
	_shell.position.y = ENTER_RISE
	var rise := create_tween().set_parallel(true)
	rise.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	rise.tween_property(_root, "modulate:a", 1.0, ENTER_TIME)
	rise.tween_property(_shell, "position:y", 0.0, ENTER_TIME)


func _build() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = DIM
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(dim)

	var shell := MarginContainer.new()
	shell.set_anchors_preset(Control.PRESET_FULL_RECT)
	shell.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(shell)

	var stack := VBoxContainer.new()
	stack.alignment = BoxContainer.ALIGNMENT_END
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shell.add_child(stack)

	var frame := PanelContainer.new()
	frame.size_flags_vertical = Control.SIZE_SHRINK_END
	frame.mouse_filter = Control.MOUSE_FILTER_STOP
	frame.gui_input.connect(_tapped)
	var skin := StyleBoxFlat.new()
	skin.bg_color = BACKDROP
	skin.border_color = MenuStyle.PAPER_EDGE
	skin.set_border_width_all(2)
	skin.set_corner_radius_all(12)
	skin.set_content_margin_all(26)
	skin.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	skin.shadow_size = 10
	frame.add_theme_stylebox_override("panel", skin)
	stack.add_child(frame)
	_root = root
	_shell = shell
	_frame = frame

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	frame.add_child(column)

	var header := HBoxContainer.new()
	column.add_child(header)

	_name_label = Label.new()
	_name_label.add_theme_font_size_override("font_size", NAME_FONT)
	_name_label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	_name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(_name_label)

	_close = _close_button()
	header.add_child(_close)

	var rule := Panel.new()
	rule.custom_minimum_size = Vector2(0.0, 1.0)
	var ink := StyleBoxFlat.new()
	ink.bg_color = MenuStyle.PAPER_EDGE
	rule.add_theme_stylebox_override("panel", ink)
	column.add_child(rule)

	_line_label = Label.new()
	_line_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_line_label.add_theme_font_size_override("font_size", LINE_FONT)
	_line_label.add_theme_color_override("font_color", MenuStyle.PAPER)
	_line_label.add_theme_constant_override("line_spacing", 7)
	_line_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_line_label)

	_choices = VBoxContainer.new()
	_choices.add_theme_constant_override("separation", 8)
	column.add_child(_choices)

	_hint = Label.new()
	_hint.add_theme_font_size_override("font_size", HINT_FONT)
	_hint.add_theme_color_override("font_color", MenuStyle.PAPER)
	column.add_child(_hint)

	_fit()
	get_viewport().size_changed.connect(_fit)


static func metrics(view: Vector2, touch := false) -> Dictionary:
	var side := clampf(view.x * SIDE_UV, SIDE_RANGE.x, SIDE_RANGE.y)
	var width := minf(maxf(view.x - side * 2.0, 0.0), MAX_WIDTH)
	var font := TOUCH_FONT if touch else 1.0
	return {
		"side": maxf((view.x - width) * 0.5, 0.0),
		"bottom": clampf(view.y * BOTTOM_UV, BOTTOM_RANGE.x, BOTTOM_RANGE.y),
		"top": view.y * TOP_UV,
		"width": width,
		"min_height": clampf(view.y * MIN_HEIGHT_UV, MIN_HEIGHT_RANGE.x, MIN_HEIGHT_RANGE.y),
		"name_font": int(round(NAME_FONT * font)),
		"line_font": int(round(LINE_FONT * font)),
		"hint_font": int(round(HINT_FONT * font)),
		"close": TOUCH_CLOSE if touch else CLOSE_SIZE,
		"reply_min_h": TOUCH_REPLY_MIN_H if touch else MenuStyle.REPLY_MIN_H,
		"reply_fill": touch,
	}


func _fit() -> void:
	if _frame == null:
		return
	var view := get_viewport().get_visible_rect().size
	var m := metrics(view, MenuStyle.touch)
	var bias := 0.0 if MenuStyle.touch else float(m["side"]) * SIDE_BIAS
	_shell.add_theme_constant_override("margin_left", int(float(m["side"]) + bias))
	_shell.add_theme_constant_override("margin_right", int(maxf(float(m["side"]) - bias, 8.0)))
	_shell.add_theme_constant_override("margin_bottom", int(m["bottom"]))
	_shell.add_theme_constant_override("margin_top", int(m["top"]))
	_floor = float(m["min_height"])
	_frame.custom_minimum_size.y = maxf(_frame.custom_minimum_size.y, _floor)
	_name_label.add_theme_font_size_override("font_size", int(m["name_font"]))
	_line_label.add_theme_font_size_override("font_size", int(m["line_font"]))
	_hint.add_theme_font_size_override("font_size", int(m["hint_font"]))
	_close.custom_minimum_size = Vector2(float(m["close"]), float(m["close"]))
	_reply_min_h = float(m["reply_min_h"])
	_reply_fill = bool(m["reply_fill"])
	for reply in _choices.get_children():
		_dress_reply(reply as Control)


func _dress_reply(reply: Control) -> void:
	reply.custom_minimum_size.y = _reply_min_h
	reply.size_flags_horizontal = Control.SIZE_FILL if _reply_fill else Control.SIZE_SHRINK_BEGIN


func _reserve() -> void:
	if _frame == null:
		return
	_frame.custom_minimum_size.y = 0.0
	_choices.visible = true
	_frame.custom_minimum_size.y = maxf(_frame.get_combined_minimum_size().y, _floor)


func retranslate() -> void:
	if _close:
		_close.tooltip_text = I18n.t("dlg.close")
	if runner and runner.is_running():
		_name_label.text = I18n.t(runner.speaker_key())


func _close_button() -> Button:
	var out := Button.new()
	out.name = "Close"
	out.text = "✕"
	out.flat = true
	out.tooltip_text = I18n.t("dlg.close")
	out.focus_mode = Control.FOCUS_NONE
	out.custom_minimum_size = Vector2(CLOSE_SIZE, CLOSE_SIZE)
	out.add_theme_font_size_override("font_size", CLOSE_FONT)
	out.add_theme_color_override("font_color", MenuStyle.PAPER)
	out.add_theme_color_override("font_hover_color", MenuStyle.PAPER_HOVER)
	out.add_theme_color_override("font_pressed_color", MenuStyle.PAPER_PRESSED)
	out.pressed.connect(close)
	return out


func _show_node() -> void:
	if runner == null or not runner.is_running():
		return
	_name_label.text = I18n.t(runner.speaker_key())
	_line_label.text = _spoken(runner.line_key())
	_letters = _line_label.text.length()
	_written = 0.0
	_held = 0.0
	_line_label.visible_characters = 0

	for child in _choices.get_children():
		_choices.remove_child(child)
		child.queue_free()
	var numbered := 0
	for choice in runner.choices():
		var index: int = choice[&"index"]
		var text := _spoken(str(choice[&"text"]))
		numbered += 1
		if numbered <= REPLY_KEYS:
			text = "%d.  %s" % [numbered, text]
		var button := PaperButton.reply(text, func() -> void: _take(index))
		_dress_reply(button)
		button.mouse_entered.connect(button.grab_focus)
		_choices.add_child(button)

	_reserve()
	_choices.visible = false
	_hint.text = ""
	_pulse = 0.0
	_hint.modulate.a = 1.0

	if _letters > 0:
		speaking.emit()
	else:
		listening.emit()


func _process(delta: float) -> void:
	if not is_typing():
		_breathe(delta)
		return
	if _held > 0.0:
		_held = maxf(_held - delta, 0.0)
		return
	_written = minf(_written + TYPING_SPEED * delta, float(_letters))
	var shown := int(_written)
	if shown > _line_label.visible_characters:
		_line_label.visible_characters = shown
		var last := _line_label.text.substr(maxi(shown - 1, 0), 1)
		if shown < _letters and PAUSE_AFTER.has(last):
			_held = PAUSE_AFTER[last]
	if not is_typing():
		_finish_line()


func _breathe(delta: float) -> void:
	if _hint == null or _hint.text == "":
		return
	_pulse += delta
	_hint.modulate.a = 0.55 + 0.45 * (0.5 + 0.5 * sin(_pulse * 3.4))


func is_typing() -> bool:
	return _line_label != null and _line_label.visible_characters >= 0 \
			and _line_label.visible_characters < _letters


func skip_typing() -> void:
	if not is_typing():
		return
	_written = float(_letters)
	_line_label.visible_characters = _letters
	_held = 0.0
	_finish_line()


func _finish_line() -> void:
	_line_label.visible_characters = -1
	listening.emit()
	if _choices.get_child_count() > 0:
		_choices.visible = true
		(_choices.get_child(0) as Control).grab_focus()
		_hint.text = ""
		return
	_hint.text = I18n.t("dlg.continue", {"key": Hint.label(&"interact", "E")})


func _numbered(event: InputEvent) -> int:
	if not _choices.visible:
		return -1
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return -1
	var slot := key.keycode - KEY_1
	if slot < 0 or slot >= mini(REPLY_KEYS, _choices.get_child_count()):
		return -1
	return slot


func _spoken(key: String) -> String:
	return I18n.t(key, {"player": _player})


func speaker_name() -> String:
	var who := str(Auth.requested_name()) if Auth else ""
	return who if who != "" else I18n.t("dlg.player")


func _take(index: int) -> void:
	if runner == null or not runner.is_running() or _pending >= 0:
		return
	var said := ""
	for choice in runner.choices():
		if int(choice[&"index"]) == index:
			said = _spoken(str(choice[&"text"]))
			break
	if said == "":
		runner.choose(index)
		return
	_pending = index
	_say(_player, said)


func _say(who: String, line: String) -> void:
	_name_label.text = who
	_line_label.text = line
	_letters = line.length()
	_written = 0.0
	_held = 0.0
	_line_label.visible_characters = 0
	for child in _choices.get_children():
		_choices.remove_child(child)
		child.queue_free()
	_choices.visible = false
	_hint.text = ""
	_pulse = 0.0
	_hint.modulate.a = 1.0
	listening.emit()


func _answer() -> void:
	var index := _pending
	_pending = -1
	if runner and runner.is_running():
		runner.choose(index)


func _input(event: InputEvent) -> void:
	if runner == null or not runner.is_running():
		return
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		close()
		return
	var numbered := _numbered(event)
	if numbered >= 0:
		get_viewport().set_input_as_handled()
		(_choices.get_child(numbered) as Button).pressed.emit()
		return
	if event.is_action_pressed(&"interact") or event.is_action_pressed(&"ui_accept"):
		get_viewport().set_input_as_handled()
		_go_on()


func _tapped(event: InputEvent) -> void:
	var down := false
	if event is InputEventScreenTouch:
		down = (event as InputEventScreenTouch).pressed
	elif event is InputEventMouseButton:
		var click := event as InputEventMouseButton
		down = click.pressed and click.button_index == MOUSE_BUTTON_LEFT
	if not down or runner == null or not runner.is_running():
		return
	_frame.accept_event()
	_go_on()


func _go_on() -> void:
	if is_typing():
		skip_typing()
	elif _pending >= 0:
		_answer()
	elif runner.choices().is_empty():
		runner.advance()


func close() -> void:
	if _closing:
		return
	_closing = true
	if _open == self:
		_open = null
	if runner:
		runner.stop()
	_set_crosshair(true)
	if _was_captured and DisplayServer.window_can_draw():
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	closed.emit()
	queue_free()


func _exit_tree() -> void:
	close()


func _set_crosshair(shown: bool) -> void:
	var scene := get_tree().current_scene if get_tree() else null
	var hud := scene.get_node_or_null(^"Crosshair") if scene else null
	if hud:
		hud.visible = shown
