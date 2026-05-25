extends "res://ui/components/panel_base.gd"

const NdMenuButton := preload("res://ui/components/menu_button.gd")
const NdMenuBackdrop := preload("res://ui/components/menu_backdrop.gd")

signal play_pressed()
signal sign_in_pressed()
signal settings_pressed()
signal quit_pressed()

const BUTTON_ACCENT := Color(0.32, 0.78, 0.95, 1.0)
const BUTTON_BG := Color(0.06, 0.08, 0.12, 0.92)

var _panel: PanelContainer
var _title: Label
var _subtitle: Label
var _user_chip: Label
var _play_btn: Control
var _sign_in_btn: Control
var _settings_btn: Control
var _quit_btn: Control
var _status_line: Label

func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(center)

	_panel = NdMenuBackdrop.new()
	_panel.custom_minimum_size = Vector2(_min_width(), 0)
	_panel.accent_color = BUTTON_ACCENT
	_panel.corner_radius = 18.0
	_panel.overlay_alpha = 0.32
	center.add_child(_panel)

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 28)
	margin.add_theme_constant_override("margin_right", 28)
	margin.add_theme_constant_override("margin_top", 26)
	margin.add_theme_constant_override("margin_bottom", 26)
	_panel.add_child(margin)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", Tokens.SPACE_MD)
	margin.add_child(vb)

	_title = make_label("Nexus Defense", Tokens.FONT_DISPLAY, Tokens.COLOR_ACCENT)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_constant_override("outline_size", 6)
	vb.add_child(_title)

	_subtitle = make_label("Tower-defense MVP · alpha", Tokens.FONT_BODY, Tokens.COLOR_TEXT_MUTED)
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(_subtitle)

	_user_chip = make_label("Not signed in", Tokens.FONT_SMALL, Tokens.COLOR_TEXT_MUTED)
	_user_chip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(_user_chip)

	vb.add_child(_divider())

	_play_btn = _add_button(vb, "Play", 56, func() -> void:
		play_pressed.emit()
		panel_event.emit("play", null)
	)
	_sign_in_btn = _add_button(vb, "Sign In", 48, func() -> void:
		sign_in_pressed.emit()
		panel_event.emit("sign_in", null)
	)
	_settings_btn = _add_button(vb, "Settings", 48, func() -> void:
		settings_pressed.emit()
		panel_event.emit("settings", null)
	)
	_quit_btn = _add_button(vb, "Quit", 48, func() -> void:
		quit_pressed.emit()
		panel_event.emit("quit", null)
	)

	_status_line = make_label("", Tokens.FONT_SMALL, Tokens.COLOR_TEXT_MUTED)
	_status_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vb.add_child(_status_line)

	_refresh_session_chip()

func _add_button(parent: Node, label: String, height: int, on_press: Callable) -> Control:
	var btn: Control = NdMenuButton.new()
	btn.text = label
	btn.bg_color = BUTTON_BG
	btn.accent_color = BUTTON_ACCENT
	btn.corner_radius = 12.0
	btn.overlay_alpha = 0.18
	btn.custom_minimum_size = Vector2(0, height)
	btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	btn.pressed.connect(on_press)
	parent.add_child(btn)
	return btn

func _min_width() -> int:
	var bp := get_node_or_null("/root/Bp")
	if bp and bp.is_mobile():
		return 320
	return 420

func _divider() -> Control:
	var c := ColorRect.new()
	c.custom_minimum_size = Vector2(0, 1)
	c.color = Tokens.COLOR_OUTLINE
	return c

func _on_breakpoint(_klass: int) -> void:
	if _panel:
		_panel.custom_minimum_size = Vector2(_min_width(), 0)

func _refresh_session_chip() -> void:
	var sb := get_node_or_null("/root/Supabase")
	if sb and sb.has_method("has_cached_session") and bool(sb.call("has_cached_session")):
		set_signed_in(String(sb.call("cached_username")))
		return
	set_signed_out()

func set_signed_in(username: String) -> void:
	var display: String = username if not username.is_empty() else "guest"
	_user_chip.text = "Signed in as %s" % display
	_user_chip.add_theme_color_override("font_color", Tokens.COLOR_OK)
	if _sign_in_btn:
		_sign_in_btn.text = "Switch User"

func set_signed_out() -> void:
	_user_chip.text = "Not signed in (dev fallback active)"
	_user_chip.add_theme_color_override("font_color", Tokens.COLOR_TEXT_MUTED)
	if _sign_in_btn:
		_sign_in_btn.text = "Sign In"

func set_status(line: String, kind: String = "info") -> void:
	_status_line.text = line
	var color: Color = Tokens.COLOR_TEXT_MUTED
	match kind:
		"ok": color = Tokens.COLOR_OK
		"warn": color = Tokens.COLOR_WARN
		"danger": color = Tokens.COLOR_DANGER
		"info": color = Tokens.COLOR_ACCENT
	_status_line.add_theme_color_override("font_color", color)

func set_busy(busy: bool) -> void:
	if _play_btn and _play_btn.has_method("set_disabled"):
		_play_btn.set_disabled(busy)
	if _sign_in_btn and _sign_in_btn.has_method("set_disabled"):
		_sign_in_btn.set_disabled(busy)

func apply(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	if data.has("title"):
		_title.text = String(data["title"])
	if data.has("subtitle"):
		_subtitle.text = String(data["subtitle"])
	if data.has("signed_in"):
		if bool(data["signed_in"]):
			set_signed_in(String(data.get("username", "")))
		else:
			set_signed_out()
	if data.has("status"):
		set_status(String(data["status"]), String(data.get("status_kind", "info")))
	if data.has("busy"):
		set_busy(bool(data["busy"]))
