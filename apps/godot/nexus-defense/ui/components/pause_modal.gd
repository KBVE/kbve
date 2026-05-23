extends "res://ui/components/panel_base.gd"

var _backdrop: ColorRect
var _panel: PanelContainer

signal action(verb: String)

func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	_backdrop = ColorRect.new()
	_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_backdrop.color = Tokens.COLOR_OVERLAY
	_backdrop.mouse_filter = Control.MOUSE_FILTER_STOP
	_backdrop.gui_input.connect(_on_backdrop_input)
	add_child(_backdrop)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	_panel = PanelContainer.new()
	_panel.theme_type_variation = "PanelContainerModal"
	_panel.custom_minimum_size = Vector2(_min_width(), 0)
	center.add_child(_panel)

	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", Tokens.SPACE_MD)
	_panel.add_child(vb)

	var title := make_label("Paused", Tokens.FONT_H1, Tokens.COLOR_TEXT)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(title)

	var subtitle := make_label("Catch your breath, commander.", Tokens.FONT_BODY, Tokens.COLOR_TEXT_MUTED)
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(subtitle)

	vb.add_child(_divider())

	vb.add_child(_action_btn("Resume", "Primary", "resume"))
	vb.add_child(_action_btn("Settings", "", "settings"))
	vb.add_child(_action_btn("Quit to Menu", "Danger", "quit"))

	get_tree().paused = true
	process_mode = Node.PROCESS_MODE_ALWAYS

func _min_width() -> int:
	var bp := get_node_or_null("/root/Bp")
	if bp and bp.is_mobile():
		return 280
	return 360

func _action_btn(label: String, variant: String, verb: String) -> Button:
	var b := make_button(label, variant)
	b.custom_minimum_size = Vector2(0, 52)
	b.pressed.connect(_on_action.bind(verb))
	return b

func _divider() -> Control:
	var c := ColorRect.new()
	c.custom_minimum_size = Vector2(0, 1)
	c.color = Tokens.COLOR_OUTLINE
	return c

func _on_action(verb: String) -> void:
	action.emit(verb)
	panel_event.emit("action", verb)
	match verb:
		"resume":
			_close()
		"quit":
			_close()
			get_tree().quit()

func _on_backdrop_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		_close()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("pause") or event.is_action_pressed("ui_cancel"):
		_close()
		get_viewport().set_input_as_handled()

func _close() -> void:
	get_tree().paused = false
	var ui := get_node_or_null("/root/Ui")
	if ui:
		ui.close("pause")

func close_anim() -> void:
	get_tree().paused = false
	await super.close_anim()
