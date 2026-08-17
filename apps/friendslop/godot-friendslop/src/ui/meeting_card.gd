class_name MeetingCard
extends CanvasLayer


signal finished

const RISE := 0.22
const HOLD := 0.95
const FALL := 0.26
const DRIFT := 18.0

const NAME_FONT := 76
const ROLE_FONT := 22
const EYEBROW_FONT := 18
const RULE_WIDTH := 260.0

const LAYER := 130

var _root: Control
var _column: VBoxContainer
var _done := false
var _elapsed := 0.0


static func present(tree: SceneTree, who: String, title := "") -> MeetingCard:
	var card := MeetingCard.new()
	card.name = "MeetingCard"
	var host: Node = tree.current_scene if tree.current_scene != null else tree.root
	host.add_child(card)
	card._build(who, title)
	card._play()
	return card


func _init() -> void:
	layer = LAYER
	process_mode = Node.PROCESS_MODE_ALWAYS


func _build(who: String, title: String) -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_root = root

	var column := VBoxContainer.new()
	column.set_anchors_preset(Control.PRESET_CENTER)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 6)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(column)
	_column = column

	column.add_child(_line(I18n.t("dlg.met"), EYEBROW_FONT, MenuStyle.PAPER))
	column.add_child(_line(who, NAME_FONT, MenuStyle.PAPER_HOVER))
	column.add_child(_rule())
	if title != "":
		column.add_child(_line(title, ROLE_FONT, MenuStyle.PAPER))


func _line(text: String, size: int, tint: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", tint)
	label.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.03, 0.9))
	label.add_theme_constant_override("outline_size", 8)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _rule() -> Panel:
	var rule := Panel.new()
	rule.custom_minimum_size = Vector2(RULE_WIDTH, 1.0)
	rule.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var ink := StyleBoxFlat.new()
	ink.bg_color = MenuStyle.PAPER_EDGE
	rule.add_theme_stylebox_override("panel", ink)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return rule


func _play() -> void:
	_root.modulate.a = 0.0
	_column.position.y = DRIFT
	_elapsed = 0.0
	set_process(true)


func _process(delta: float) -> void:
	if _done:
		return
	_elapsed += delta
	if _elapsed >= RISE + HOLD + FALL:
		dismiss()
		return
	var shown := 1.0
	var lift := 0.0
	if _elapsed < RISE:
		shown = _eased(_elapsed / RISE)
		lift = DRIFT * (1.0 - shown)
	elif _elapsed > RISE + HOLD:
		var out := _eased((_elapsed - RISE - HOLD) / FALL)
		shown = 1.0 - out
		lift = -DRIFT * out
	_root.modulate.a = shown
	_column.position.y = lift


static func _eased(t: float) -> float:
	var at := clampf(t, 0.0, 1.0)
	return 1.0 - pow(1.0 - at, 3.0)


static func length() -> float:
	return RISE + HOLD + FALL


func dismiss() -> void:
	if _done:
		return
	_done = true
	finished.emit()
	queue_free()


func _input(event: InputEvent) -> void:
	if _done:
		return
	if event.is_action_pressed(&"interact") or event.is_action_pressed(&"ui_accept") \
			or event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		dismiss()


func _exit_tree() -> void:
	dismiss()
