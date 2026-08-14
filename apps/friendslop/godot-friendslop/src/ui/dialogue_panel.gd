class_name DialoguePanel
extends CanvasLayer

## The conversation on screen. Built in code, like every other panel here, and styled off
## MenuStyle so it reads as the same paper the menus are printed on.
##
## It owns no dialogue logic: the runner answers what is said and what can be said back,
## and this turns that into a name, a line and a column of buttons.

const PaperButton := preload("res://src/ui/components/paper_button.gd")
const RunnerScript := preload("res://src/dialogue/dialogue_runner.gd")

signal closed

const PANEL_HEIGHT := 0.34
const PANEL_MARGIN := Vector2(90.0, 40.0)
const BACKDROP := Color(0.07, 0.06, 0.05, 0.82)
const NAME_FONT := 26
const LINE_FONT := 20

## One panel at a time, which is also what the player's controls read to know that the
## keys belong to a conversation right now.
static var _open: DialoguePanel = null

var runner: DialogueRunner

var _name_label: Label
var _line_label: Label
var _choices: VBoxContainer
var _hint: Label
var _was_captured := false
var _closing := false


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
	tree.root.add_child(panel)
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


func _build() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

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
	skin.border_color = MenuStyle.PAPER
	skin.set_border_width_all(2)
	skin.set_corner_radius_all(6)
	skin.set_content_margin_all(22)
	frame.add_theme_stylebox_override("panel", skin)
	root.add_child(frame)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	frame.add_child(column)

	_name_label = Label.new()
	_name_label.add_theme_font_size_override("font_size", NAME_FONT)
	_name_label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	column.add_child(_name_label)

	_line_label = Label.new()
	_line_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_line_label.add_theme_font_size_override("font_size", LINE_FONT)
	_line_label.add_theme_color_override("font_color", MenuStyle.PAPER)
	_line_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_line_label)

	_choices = VBoxContainer.new()
	_choices.add_theme_constant_override("separation", 6)
	column.add_child(_choices)

	_hint = Label.new()
	_hint.add_theme_font_size_override("font_size", 14)
	_hint.add_theme_color_override("font_color", MenuStyle.PAPER)
	column.add_child(_hint)


## Redrawn whenever the runner moves, which is the only thing that changes what is on
## screen.
func _show_node() -> void:
	if runner == null or not runner.is_running():
		return
	_name_label.text = I18n.t(runner.speaker_key())
	_line_label.text = I18n.t(runner.line_key())
	for child in _choices.get_children():
		child.queue_free()

	var choices := runner.choices()
	_hint.text = "" if not choices.is_empty() else I18n.t("dlg.continue")
	for choice in choices:
		var index: int = choice[&"index"]
		var button := PaperButton.make(I18n.t(str(choice[&"text"])),
				func() -> void: _take(index))
		button.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_choices.add_child(button)
	if not choices.is_empty():
		(_choices.get_child(0) as Control).grab_focus()


func _take(index: int) -> void:
	if runner and runner.is_running():
		runner.choose(index)


## Keys are read here rather than left to the world: a conversation holds the interact key
## while it is up, or the same press that answers a question also opens the next talk.
func _unhandled_input(event: InputEvent) -> void:
	if runner == null or not runner.is_running():
		return
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		close()
		return
	if event.is_action_pressed(&"interact") or event.is_action_pressed(&"ui_accept"):
		if runner.choices().is_empty():
			get_viewport().set_input_as_handled()
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
	if _was_captured and DisplayServer.window_can_draw():
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	closed.emit()
	queue_free()


func _exit_tree() -> void:
	if _open == self:
		_open = null
