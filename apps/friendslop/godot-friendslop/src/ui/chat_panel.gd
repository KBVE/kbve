class_name ChatPanel
extends CanvasLayer


const GROUP := &"chat_panel"
const LOG_FRACTION_WIDE := 0.32
const LOG_FRACTION_TALL := 0.42
const WIDE_ASPECT := 1.2
const HISTORY := 80
const FADE_SECONDS := 12.0

var _root: MarginContainer
var _log: RichTextLabel
var _entry: LineEdit
var _notice: Label
var _client: ChatClient
var _open := false
var _idle := 0.0


func _ready() -> void:
	add_to_group(GROUP)
	layer = 120
	process_mode = Node.PROCESS_MODE_ALWAYS
	_build()
	_client = ChatClient.new()
	add_child(_client)
	_client.message.connect(_on_message)
	_client.state_changed.connect(_on_state)
	_client.failed.connect(_on_failed)
	Auth.changed.connect(_refresh_access)
	get_viewport().size_changed.connect(_layout)
	_refresh_access()
	_layout()


func _build() -> void:
	_root = MarginContainer.new()
	_root.name = "Root"
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)

	var column := VBoxContainer.new()
	column.name = "Column"
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.alignment = BoxContainer.ALIGNMENT_END
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(column)

	_log = RichTextLabel.new()
	_log.name = "Log"
	_log.bbcode_enabled = true
	_log.scroll_following = true
	_log.fit_content = false
	_log.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.add_theme_color_override("default_color", Color(0.96, 0.93, 0.85))
	column.add_child(_log)

	_notice = Label.new()
	_notice.name = "Notice"
	_notice.add_theme_color_override("font_color", Color(0.9, 0.82, 0.6))
	_notice.visible = false
	column.add_child(_notice)

	_entry = LineEdit.new()
	_entry.name = "Entry"
	_entry.placeholder_text = "Say something"
	_entry.max_length = ChatClient.MAX_CONTENT
	_entry.visible = false
	_entry.text_submitted.connect(_on_submit)
	column.add_child(_entry)

func _ui_scale() -> float:
	return MenuStyle.ui_scale(get_viewport())


func _layout() -> void:
	if _root == null:
		return
	var view := get_viewport().get_visible_rect().size
	var s := _ui_scale()
	var pad := int(16.0 * s)
	_root.add_theme_constant_override("margin_left", pad)
	_root.add_theme_constant_override("margin_right", pad)
	_root.add_theme_constant_override("margin_top", pad)
	_root.add_theme_constant_override("margin_bottom", pad)

	var wide := view.x / maxf(view.y, 1.0) > WIDE_ASPECT
	var fraction := LOG_FRACTION_WIDE if wide else LOG_FRACTION_TALL
	var width := view.x * (0.42 if wide else 1.0) - float(pad * 2)
	_log.custom_minimum_size = Vector2(width, view.y * fraction)
	_log.add_theme_font_size_override("normal_font_size", int(17.0 * s))
	_notice.add_theme_font_size_override("font_size", int(16.0 * s))
	_entry.add_theme_font_size_override("font_size", int(18.0 * s))
	_entry.custom_minimum_size = Vector2(width, 34.0 * s)


func _refresh_access() -> void:
	if Auth.is_signed_in():
		_notice.visible = false
		_client.start()
	else:
		_close_entry()
		_notice.text = I18n.t("chat.signin_required")
		_notice.visible = true
		_client.stop()


func has_focus_grabbed() -> bool:
	return _open


func toggle() -> void:
	if _open:
		_close_entry()
	else:
		_open_entry()


func _open_entry() -> void:
	if not Auth.is_signed_in() or not _client.is_connected_to_chat():
		return
	_open = true
	_entry.visible = true
	_entry.grab_focus()
	_idle = 0.0


func _close_entry() -> void:
	_open = false
	if _entry:
		_entry.release_focus()
		_entry.text = ""
		_entry.visible = false


func _on_submit(text: String) -> void:
	if not _client.send_chat(text):
		_append("system", "", I18n.t("chat.send_failed"))
	_close_entry()


func _on_state(connected: bool) -> void:
	_notice.visible = not connected and Auth.is_signed_in()
	if not connected:
		_notice.text = I18n.t("chat.reconnecting")
		_close_entry()


func _on_failed(reason: String) -> void:
	_notice.text = I18n.t(reason)
	_notice.visible = true


func _on_message(kind: String, sender: String, content: String) -> void:
	_append(kind, sender, content)


func _append(kind: String, sender: String, content: String) -> void:
	var line := ""
	match kind:
		"system", "notice":
			line = "[color=#d9c48a]%s[/color]" % content
		"join", "part":
			line = "[color=#8fa9c4]%s %s[/color]" % [sender, content]
		_:
			line = "[color=#b9d98f]%s[/color]: %s" % [sender, content]
	_log.append_text(line + "\n")
	while _log.get_line_count() > HISTORY:
		_log.remove_paragraph(0)
	_idle = 0.0
	_log.modulate.a = 1.0


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"chat"):
		toggle()
		get_viewport().set_input_as_handled()
	elif _open and event.is_action_pressed(&"ui_cancel"):
		_close_entry()
		get_viewport().set_input_as_handled()


func _process(delta: float) -> void:
	if _open:
		_idle = 0.0
		_log.modulate.a = 1.0
		return
	_idle += delta
	if _idle > FADE_SECONDS:
		_log.modulate.a = maxf(_log.modulate.a - delta, 0.25)
