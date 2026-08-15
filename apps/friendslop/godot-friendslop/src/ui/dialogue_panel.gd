class_name DialoguePanel
extends CanvasLayer

## The conversation on screen. Built in code, like every other panel here, and styled off
## MenuStyle so it reads as the same paper the menus are printed on.
##
## It owns no dialogue logic: the runner answers what is said and what can be said back,
## and this turns that into a name, a line and a column of buttons.

const PaperButton := preload("res://src/ui/components/paper_button.gd")
const RunnerScript := preload("res://src/dialogue/dialogue_runner.gd")
const Hint := preload("res://src/ui/input_hint.gd")

signal closed

const PANEL_HEIGHT := 0.34
const PANEL_MARGIN := Vector2(90.0, 40.0)
## Ink and dusk rather than black: a neutral grey box over a warm world reads as a
## different game's menu dropped on top of this one.
const BACKDROP := Color(0.10, 0.075, 0.055, 0.86)
## Laid over the world behind the panel, so the eye settles on the words rather than on
## the grass still waving about behind them.
const DIM := Color(0.06, 0.045, 0.035, 0.38)
## How long the panel takes to arrive, and how far it rises on the way in.
const ENTER_TIME := 0.16
const ENTER_RISE := 26.0
## Replies are numbered, so a player can answer without reaching for the mouse.
const REPLY_KEYS := 9
const NAME_FONT := 26
const LINE_FONT := 20
const CLOSE_FONT := 22
const CLOSE_SIZE := 34.0

## Characters a second the line is written at. Fast enough to read along with, slow enough
## that it reads as somebody speaking.
const TYPING_SPEED := 52.0
## Punctuation is held on, which is most of what makes typing sound like talking rather
## than a printer.
const PAUSE_AFTER := {".": 0.18, "?": 0.18, "!": 0.18, ",": 0.08, ";": 0.1, ":": 0.1, "—": 0.12}

## One panel at a time, which is also what the player's controls read to know that the
## keys belong to a conversation right now.
static var _open: DialoguePanel = null

var runner: DialogueRunner

var _root: Control
var _frame: PanelContainer
var _name_label: Label
var _line_label: Label
var _choices: VBoxContainer
var _hint: Label
var _was_captured := false
var _closing := false
## Drives the waiting hint's breathing, which is the only thing on screen that moves once
## the line is out.
var _pulse := 0.0

## Characters written so far, as a float so a slow line still moves every frame.
var _written := 0.0
var _letters := 0
## Seconds still owed to a comma or a full stop before the next letter.
var _held := 0.0


static func is_open() -> bool:
	return _open != null and is_instance_valid(_open)


## Puts a conversation on screen. Returns null when the graph did not load, so a broken
## file is a warning in the log rather than an empty box the player cannot dismiss.
static func open(tree: SceneTree, graph: DialogueGraph, state: DialogueState) -> DialoguePanel:
	if is_open():
		return null
	var panel := DialoguePanel.new()
	panel.name = "DialoguePanel"
	panel.runner = RunnerScript.new()
	## Hung off the world rather than the tree root, so leaving the world takes the
	## conversation with it. On the root it outlives the scene swap and a player who
	## logged off mid-sentence arrives at the title screen still being talked to.
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
	runner.line_changed.connect(_show_node)
	runner.finished.connect(close)
	_was_captured = Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if _was_captured:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_set_crosshair(false)
	_enter()


## Rises into place rather than appearing, which reads as somebody starting to speak
## instead of a box being switched on. Short enough not to be waited through.
func _enter() -> void:
	_root.modulate.a = 0.0
	_frame.position.y = ENTER_RISE
	var rise := create_tween().set_parallel(true)
	rise.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	rise.tween_property(_root, "modulate:a", 1.0, ENTER_TIME)
	rise.tween_property(_frame, "position:y", 0.0, ENTER_TIME)


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

	var frame := PanelContainer.new()
	frame.anchor_left = 0.0
	frame.anchor_right = 1.0
	frame.anchor_top = 1.0 - PANEL_HEIGHT
	frame.anchor_bottom = 1.0
	frame.offset_left = PANEL_MARGIN.x
	frame.offset_right = -PANEL_MARGIN.x
	frame.offset_bottom = -PANEL_MARGIN.y
	frame.mouse_filter = Control.MOUSE_FILTER_STOP
	var skin := StyleBoxFlat.new()
	skin.bg_color = BACKDROP
	skin.border_color = MenuStyle.PAPER_EDGE
	skin.set_border_width_all(2)
	skin.set_corner_radius_all(12)
	skin.set_content_margin_all(26)
	skin.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	skin.shadow_size = 10
	frame.add_theme_stylebox_override("panel", skin)
	root.add_child(frame)
	_root = root
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

	header.add_child(_close_button())

	## A ruled line under the name, the way a page is headed. Also the only thing telling
	## the eye where the speaker stops and the speech starts.
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
	## Spoken lines are read in one pass, and lines set tight are read twice.
	_line_label.add_theme_constant_override("line_spacing", 7)
	_line_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_line_label)

	_choices = VBoxContainer.new()
	_choices.add_theme_constant_override("separation", 8)
	column.add_child(_choices)

	_hint = Label.new()
	_hint.add_theme_font_size_override("font_size", 14)
	_hint.add_theme_color_override("font_color", MenuStyle.PAPER)
	column.add_child(_hint)


## A way out that does not need the player to know which key leaves. Kept off the focus
## chain, or the first reply would no longer be what a keyboard lands on.
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


## Redrawn whenever the runner moves, which is the only thing that changes what is on
## screen.
func _show_node() -> void:
	if runner == null or not runner.is_running():
		return
	_name_label.text = I18n.t(runner.speaker_key())
	_line_label.text = I18n.t(runner.line_key())
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
		var text := I18n.t(str(choice[&"text"]))
		## Numbered only as far as there are keys for, or the number is a lie.
		numbered += 1
		if numbered <= REPLY_KEYS:
			text = "%d.  %s" % [numbered, text]
		var button := PaperButton.reply(text, func() -> void: _take(index))
		button.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		## The mouse moves the focus rather than fighting it, or the key that answers and
		## the reply under the pointer are two different replies.
		button.mouse_entered.connect(button.grab_focus)
		_choices.add_child(button)

	## Held back until the line is out. Replies appearing under a sentence still being
	## spoken invite an answer to a question that has not been asked yet.
	_choices.visible = false
	_hint.text = ""
	_pulse = 0.0
	_hint.modulate.a = 1.0


## Writes the line out a letter at a time, holding on the punctuation so it reads as
## somebody speaking rather than a page being pasted up.
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


## The waiting hint breathes, so a line that has finished does not look like a game that
## has stopped.
func _breathe(delta: float) -> void:
	if _hint == null or _hint.text == "":
		return
	_pulse += delta
	_hint.modulate.a = 0.55 + 0.45 * (0.5 + 0.5 * sin(_pulse * 3.4))


## Whether the line is still being written, which is also whether a press means "hurry up"
## rather than "go on".
func is_typing() -> bool:
	return _line_label != null and _line_label.visible_characters >= 0 \
			and _line_label.visible_characters < _letters


## Puts the whole line up at once, for a player who reads faster than it types.
func skip_typing() -> void:
	if not is_typing():
		return
	_written = float(_letters)
	_line_label.visible_characters = _letters
	_held = 0.0
	_finish_line()


func _finish_line() -> void:
	_line_label.visible_characters = -1
	if _choices.get_child_count() > 0:
		_choices.visible = true
		(_choices.get_child(0) as Control).grab_focus()
		_hint.text = ""
		return
	_hint.text = I18n.t("dlg.continue", {"key": Hint.label(&"interact", "E")})


## Which reply a number key asked for, or -1 for anything that was not one. Only answered
## while the replies are up, or a number typed at a line still being spoken would answer a
## question the player has not read.
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


func _take(index: int) -> void:
	if runner and runner.is_running():
		runner.choose(index)


## Read at _input rather than left unhandled, because the pause menu reads Escape there
## too: a conversation has to be the thing Escape leaves, or the menu opens on top of a
## talk the player is still stuck in.
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
		## Pressed rather than chosen, so the key and the button cannot disagree about
		## which reply the third one down is.
		(_choices.get_child(numbered) as Button).pressed.emit()
		return
	if event.is_action_pressed(&"interact") or event.is_action_pressed(&"ui_accept"):
		get_viewport().set_input_as_handled()
		## The first press hurries the line up rather than skipping past it, or a player
		## leaning on the key never sees the half of it they were reading.
		if is_typing():
			skip_typing()
		elif runner.choices().is_empty():
			runner.advance()


## Reentrant: stopping the runner reports it finished, and that is wired back to here.
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


## Anything that frees the panel ends the talk, not just close(): the world going away
## under a conversation still has to hand the player back their controls.
func _exit_tree() -> void:
	close()


## The reticle is aimed at whoever is being talked to and reads as targeting them.
func _set_crosshair(shown: bool) -> void:
	var scene := get_tree().current_scene if get_tree() else null
	var hud := scene.get_node_or_null(^"Crosshair") if scene else null
	if hud:
		hud.visible = shown
