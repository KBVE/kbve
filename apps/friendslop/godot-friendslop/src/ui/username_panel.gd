class_name UsernamePanel
extends Control

## Asks a brand-new account to choose its handle, over the title's world.

signal submitted(username: String)
signal cancelled

const WIDTH := 320.0

## The same rule the web and mobile clients enforce: three to twenty-four characters,
## starting with a letter, letters and digits and underscores after it. Checked here so a
## name that cannot possibly be accepted is never sent, and enforced by the API regardless
## — this is a courtesy, not the boundary.
const PATTERN := "^[a-zA-Z][a-zA-Z0-9_]{2,23}$"

var field: LineEdit
var submit_button: PaperButton
var cancel_button: PaperButton
var message_label: Label

var _busy := false
var _regex := RegEx.new()


func _ready() -> void:
	_regex.compile(PATTERN)
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build()


## Whether `name` could be accepted at all.
static func is_valid(name: String) -> bool:
	var re := RegEx.new()
	re.compile(PATTERN)
	return re.search(name) != null


func _build() -> void:
	var scrim := ColorRect.new()
	scrim.color = Color(0.05, 0.04, 0.03, 0.55)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(scrim)

	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 10)
	column.anchor_left = 0.5
	column.anchor_right = 0.5
	column.anchor_top = 0.5
	column.anchor_bottom = 0.5
	column.grow_horizontal = Control.GROW_DIRECTION_BOTH
	column.grow_vertical = Control.GROW_DIRECTION_BOTH
	add_child(column)

	var heading := _caption(I18n.t("username.prompt"), 20)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(heading)

	field = LineEdit.new()
	field.placeholder_text = I18n.t("username.placeholder")
	field.custom_minimum_size = Vector2(WIDTH, MenuStyle.BUTTON_MIN.y * 0.8)
	field.max_length = 24
	field.text_changed.connect(_on_typed)
	field.text_submitted.connect(func(_t: String) -> void: _submit())
	column.add_child(field)

	message_label = _caption(I18n.t("username.rule"), 13)
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label.custom_minimum_size = Vector2(WIDTH, 0)
	message_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(message_label)

	submit_button = PaperButton.make(I18n.t("username.claim"), _submit)
	submit_button.custom_minimum_size = Vector2(WIDTH, MenuStyle.BUTTON_MIN.y)
	submit_button.disabled = true
	column.add_child(submit_button)

	cancel_button = PaperButton.make(I18n.t("title.sign_out"), func() -> void: cancelled.emit())
	cancel_button.custom_minimum_size = Vector2(WIDTH, MenuStyle.BUTTON_MIN.y)
	column.add_child(cancel_button)

	field.grab_focus()


## Lowercased on the way out, the way the other clients send it, so the same person does
## not end up with two spellings of one handle depending on which client they used.
func typed() -> String:
	return field.text.strip_edges().to_lower()


func _on_typed(_text: String) -> void:
	var name := typed()
	submit_button.disabled = _busy or not is_valid(name)
	if name.is_empty() or is_valid(name):
		message_label.text = I18n.t("username.rule")
		message_label.modulate = Color(1, 1, 1, 1)
	else:
		message_label.modulate = Color(1.0, 0.75, 0.55)


func _submit() -> void:
	if _busy or not is_valid(typed()):
		return
	set_busy(true)
	submitted.emit(typed())


## Locked while the claim is in flight: the name is taken by whoever asks first, and a
## second press would race the answer to the first.
func set_busy(busy: bool) -> void:
	_busy = busy
	submit_button.disabled = busy or not is_valid(typed())
	field.editable = not busy
	if busy:
		message_label.text = I18n.t("username.claiming")
		message_label.modulate = Color(1, 1, 1, 1)


func show_message(text: String) -> void:
	set_busy(false)
	message_label.text = text
	message_label.modulate = Color(1.0, 0.75, 0.55)


func _caption(text: String, size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	return label


## Escape signs out rather than dismissing. An account with no handle cannot do anything,
## so a modal that could simply be closed would strand the player on a title screen that
## looks signed in and behaves as though nobody is.
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		cancelled.emit()
		get_viewport().set_input_as_handled()
