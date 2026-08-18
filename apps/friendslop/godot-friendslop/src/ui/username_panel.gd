class_name UsernamePanel
extends Control


signal submitted(username: String)
signal cancelled

const WIDTH := 320.0

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
	_layout()
	get_viewport().size_changed.connect(_layout)


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


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		cancelled.emit()
		get_viewport().set_input_as_handled()


## Resizes to the viewport rather than the 1280x720 design, and re-runs whenever that
## changes so a phone rotating does not keep the old measurements. The width is capped
## against the safe area so the field clears a notch in landscape.
func _layout() -> void:
	if submit_button == null:
		return
	var s := MenuStyle.ui_scale(get_viewport())
	var width := _panel_width(s)
	var height := MenuStyle.BUTTON_MIN.y * s
	if field:
		field.custom_minimum_size = Vector2(width, height * 0.8)
		field.add_theme_font_size_override("font_size", int(MenuStyle.BUTTON_FONT * s))
	submit_button.custom_minimum_size = Vector2(width, height)
	submit_button.add_theme_font_size_override("font_size", int(MenuStyle.BUTTON_FONT * s))
	if cancel_button:
		cancel_button.custom_minimum_size = Vector2(width, height)
		cancel_button.add_theme_font_size_override("font_size", int(MenuStyle.BUTTON_FONT * s))
	if message_label:
		message_label.custom_minimum_size = Vector2(width, 0)
		message_label.add_theme_font_size_override("font_size", int(13.0 * s))


func _panel_width(s: float) -> float:
	var view := get_viewport().get_visible_rect().size
	var safe := MenuStyle.safe_insets(get_viewport())
	var usable := maxf(view.x - safe.x - safe.z, 1.0)
	return minf(WIDTH * s, usable * 0.88)
