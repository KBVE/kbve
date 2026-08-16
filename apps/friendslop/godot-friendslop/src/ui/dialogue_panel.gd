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
## A line has started being written, and whoever is saying it should look like they are
## saying it. Paired with `listening`, which is the line landing and the turn passing back
## to the player. The panel does not know there is a body attached; it only says which of
## the two is happening.
signal speaking
signal listening

## The panel takes the height of what is being said rather than a fixed share of the screen:
## a one-line greeting in a box sized for a speech reads as a game waiting for something
## else to arrive.
##
## Width is where a phone differs most. The project stretches canvas items against a
## 1280x720 layout, so a font size means the same thing everywhere and the only thing that
## really moves is the shape of the window: a handset in landscape is far wider than it is
## tall, and a line ruled the whole way across it is one the eye loses its place in.
const MAX_WIDTH := 880.0
const SIDE_UV := 0.05
const SIDE_RANGE := Vector2(16.0, 90.0)
const BOTTOM_UV := 0.035
const BOTTOM_RANGE := Vector2(12.0, 44.0)
## Kept off the top of the screen, so whoever is talking is still in shot above the words.
const TOP_UV := 0.16
## A floor under the box, or every line resizes it and the reader's eye is dragged about by
## the frame instead of following the words.
const MIN_HEIGHT_UV := 0.2
const MIN_HEIGHT_RANGE := Vector2(120.0, 240.0)
## Touch reads at arm's length and answers with a thumb: bigger words, and replies that take
## the full width rather than only as much as they say.
const TOUCH_FONT := 1.15
const TOUCH_REPLY_MIN_H := 52.0
const TOUCH_CLOSE := 46.0
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
const HINT_FONT := 14

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
## Everything but the dimming, moved as one: the rise on the way in cannot be tweened on the
## frame itself now that a container decides where the frame sits.
var _shell: MarginContainer
var _frame: PanelContainer
var _name_label: Label
var _line_label: Label
var _choices: VBoxContainer
var _hint: Label
var _close: Button
## The shortest the box is allowed to be, and how a reply is sized, both settled by the
## window rather than by the line.
var _floor := MIN_HEIGHT_RANGE.x
var _reply_min_h := MenuStyle.REPLY_MIN_H
var _reply_fill := false
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
## A reply the player has picked and is in the middle of saying. The runner is not told
## until they are finished, so the answer and what it does to the world land together.
var _pending := -1
## Who the player is, settled when the conversation opens. Nobody signs in halfway through
## being talked to, and a name that changed mid-conversation would be a worse answer than a
## stale one -- the same person would be speaking under two names on consecutive lines.
var _player := ""


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
	_player = speaker_name()
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

	## Full rect, with the margins doing the sizing: the box then sits at the bottom of what
	## is left and takes the height of what it holds.
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
	## The box itself is a place to press. On a phone the touch HUD's USE button is behind
	## this panel, so without it a line with nothing to say back to is a line nobody can get
	## past. A tap reads the same way on a desktop, where clicking to go on is what a player
	## tries first anyway.
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
	_hint.add_theme_font_size_override("font_size", HINT_FONT)
	_hint.add_theme_color_override("font_color", MenuStyle.PAPER)
	column.add_child(_hint)

	_fit()
	get_viewport().size_changed.connect(_fit)


## Everything the shape of the window decides. Pure, and taken apart from the panel it
## dresses, so what a phone gets can be checked without a phone.
static func metrics(view: Vector2, touch := false) -> Dictionary:
	var side := clampf(view.x * SIDE_UV, SIDE_RANGE.x, SIDE_RANGE.y)
	## A line ruled from edge to edge of a wide window is hard to read back to the start of,
	## so past a point the box stops widening and centres instead.
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
		## A thumb wants the whole width to aim at; a pointer does not need it and a row of
		## full-width slabs reads as a menu rather than as something somebody would say.
		"reply_fill": touch,
	}


## Re-read whenever the window changes, so a phone turned on its side is laid out for the
## shape it is now rather than the one it started in.
func _fit() -> void:
	if _frame == null:
		return
	var view := get_viewport().get_visible_rect().size
	var m := metrics(view, MenuStyle.touch)
	_shell.add_theme_constant_override("margin_left", int(m["side"]))
	_shell.add_theme_constant_override("margin_right", int(m["side"]))
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


## Holds the box open at the height the replies will want, measured while they are up and
## before they are hidden again.
func _reserve() -> void:
	if _frame == null:
		return
	_frame.custom_minimum_size.y = 0.0
	_choices.visible = true
	_frame.custom_minimum_size.y = maxf(_frame.get_combined_minimum_size().y, _floor)


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
		## Numbered only as far as there are keys for, or the number is a lie.
		numbered += 1
		if numbered <= REPLY_KEYS:
			text = "%d.  %s" % [numbered, text]
		var button := PaperButton.reply(text, func() -> void: _take(index))
		_dress_reply(button)
		## The mouse moves the focus rather than fighting it, or the key that answers and
		## the reply under the pointer are two different replies.
		button.mouse_entered.connect(button.grab_focus)
		_choices.add_child(button)

	## Held back until the line is out. Replies appearing under a sentence still being
	## spoken invite an answer to a question that has not been asked yet.
	##
	## Their room is kept for them, though. Now the box is only as tall as it needs to be,
	## replies arriving into a box measured without them would push it upward mid-sentence
	## and move the line the player is reading.
	_reserve()
	_choices.visible = false
	_hint.text = ""
	_pulse = 0.0
	_hint.modulate.a = 1.0

	## A line with no letters in it is never typed and so never finishes, which would leave
	## a speaker talking with their mouth shut for the rest of the conversation.
	if _letters > 0:
		speaking.emit()
	else:
		listening.emit()


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
	listening.emit()
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


## Who the player is when it is their turn to speak. The account's name once they have
## signed in, and a plain stand-in while they have not.
##
## Not static, however much it looks like it could be: an autoload is not in scope inside a
## static function, and both of the two things this needs are autoloads. `Auth` is the
## singleton; `AuthSession` is the class it is an instance of, and naming that one here
## reads fine and resolves to the script rather than the session.
## A line as it is said, with the player's name filled in where the catalog asked for it.
## Somebody who knows you uses your name, which is most of the difference between a greeting
## and a recording.
func _spoken(key: String) -> String:
	return I18n.t(key, {"player": _player})


func speaker_name() -> String:
	var who := str(Auth.requested_name()) if Auth else ""
	return who if who != "" else I18n.t("dlg.player")


## A picked reply is said out loud before it is acted on. Half a conversation printed and
## the other half implied reads as a menu; both halves printed reads as two people talking.
##
## The runner is not moved yet -- the answer is still being spoken, and whatever it sets in
## the world belongs with the moment it lands rather than the moment it was clicked.
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


## Puts a line up without the runner having moved, which is the player's own turn. Whoever
## they are talking to settles while it is said: only one of them speaks at a time.
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


## Hands the reply to the runner now the player has finished saying it.
func _answer() -> void:
	var index := _pending
	_pending = -1
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
		_go_on()


## A press on the box. A reply or the close button under the finger takes its own press
## first, so this is only ever the paper between them.
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


## The first press hurries the line up rather than skipping past it, or a player leaning on
## the key never sees the half of it they were reading.
func _go_on() -> void:
	if is_typing():
		skip_typing()
	elif _pending >= 0:
		_answer()
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
