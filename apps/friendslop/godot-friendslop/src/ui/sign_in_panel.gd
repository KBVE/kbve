class_name SignInPanel
extends Control

## Email and password, over the title's world.
##
## Deliberately dumb: it collects two strings, reports them, and shows whatever
## it is told afterwards. It never touches `Auth`, so signing in can be tested
## without a network and the panel can be tested without an account.
##
## The password is held in a `LineEdit` and nowhere else — read on submit,
## cleared when the panel closes, never stored and never logged.

signal submitted(email: String, password: String)
signal cancelled

const FIELD_WIDTH := 320.0

var email_field: LineEdit
var password_field: LineEdit
var submit_button: PaperButton
var cancel_button: PaperButton
var message_label: Label

var _busy := false


func _ready() -> void:
	# Offsets as well as anchors: a Control added in code starts at zero size,
	# and anchors alone leave it that way until something else lays it out —
	# which is how the form ended up in the top-left corner of the screen.
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build()
	email_field.grab_focus()


func _build() -> void:
	var scrim := ColorRect.new()
	scrim.color = Color(0.05, 0.04, 0.03, 0.55)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# Eats clicks meant for the buttons behind it — a menu you can press through
	# is a menu that starts a session while you are typing a password into it.
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

	column.add_child(_caption(I18n.t("title.email")))
	email_field = _field(column, false)
	column.add_child(_caption(I18n.t("title.password")))
	password_field = _field(column, true)

	message_label = Label.new()
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label.custom_minimum_size = Vector2(FIELD_WIDTH, 0)
	message_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	message_label.add_theme_font_size_override("font_size", 14)
	message_label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	message_label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	message_label.add_theme_constant_override("shadow_offset_x", 1)
	message_label.add_theme_constant_override("shadow_offset_y", 1)
	column.add_child(message_label)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 8)
	column.add_child(row)

	submit_button = PaperButton.make(I18n.t("title.sign_in"), _submit)
	row.add_child(submit_button)
	cancel_button = PaperButton.make(I18n.t("action.cancel"), func() -> void: cancelled.emit())
	row.add_child(cancel_button)


func _caption(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	return label


func _field(parent: Control, secret: bool) -> LineEdit:
	var edit := LineEdit.new()
	edit.custom_minimum_size = Vector2(FIELD_WIDTH, MenuStyle.BUTTON_MIN.y * 0.8)
	edit.secret = secret
	edit.add_theme_color_override("font_color", MenuStyle.INK)
	edit.add_theme_stylebox_override("normal", _paper_box())
	edit.add_theme_stylebox_override("focus", _paper_box())
	# Enter submits from either field: a two-field form where only one of them
	# takes the key is a form people press Enter twice in.
	edit.text_submitted.connect(func(_text: String) -> void: _submit())
	parent.add_child(edit)
	return edit


func _paper_box() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = MenuStyle.PAPER
	box.content_margin_left = 8.0
	box.content_margin_right = 8.0
	return box


func _submit() -> void:
	if _busy:
		return
	submitted.emit(email_field.text, password_field.text)


## Locks the form while a sign-in is in flight, so a second Enter cannot start a
## second request against the same fields.
func set_busy(busy: bool) -> void:
	_busy = busy
	submit_button.disabled = busy
	email_field.editable = not busy
	password_field.editable = not busy
	if busy:
		message_label.text = I18n.t("title.signing_in")


func show_message(text: String) -> void:
	_busy = false
	submit_button.disabled = false
	email_field.editable = true
	password_field.editable = true
	message_label.text = text


## Called on the way out. The password lives in this node and dies with it, but
## clearing it makes that true a frame earlier and states the intent.
func clear_password() -> void:
	password_field.text = ""


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		cancelled.emit()
		get_viewport().set_input_as_handled()
