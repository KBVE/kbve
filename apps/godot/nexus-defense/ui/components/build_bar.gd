extends "res://ui/components/panel_base.gd"

const DEFAULT_TOWERS := [
	{"id": "arrow", "label": "Arrow", "icon": "🏹", "cost": 50, "accent": Color(0.34, 0.85, 0.45)},
	{"id": "cannon", "label": "Cannon", "icon": "💥", "cost": 120, "accent": Color(0.95, 0.55, 0.32)},
	{"id": "frost", "label": "Frost", "icon": "❄", "cost": 90, "accent": Color(0.5, 0.78, 0.95)},
	{"id": "magic", "label": "Magic", "icon": "✨", "cost": 200, "accent": Color(0.8, 0.5, 0.95)},
]

var towers: Array = DEFAULT_TOWERS.duplicate(true)
var selected_id: String = ""
var gold: int = 150

var _root_margin: MarginContainer
var _scroll: ScrollContainer
var _row: HBoxContainer
var _buttons: Dictionary = {}

signal tower_selected(tower_id: String)
signal tower_canceled()

func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_PASS

	var dock := VBoxContainer.new()
	dock.set_anchors_preset(Control.PRESET_FULL_RECT)
	dock.alignment = BoxContainer.ALIGNMENT_END
	dock.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(dock)

	_root_margin = make_margin(safe_margin(), 0, safe_margin(), safe_margin())
	_root_margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dock.add_child(_root_margin)

	var panel := PanelContainer.new()
	panel.theme_type_variation = "PanelContainerHud"
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_root_margin.add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", Tokens.SPACE_SM)
	panel.add_child(vbox)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", Tokens.SPACE_MD)
	vbox.add_child(header)
	header.add_child(make_label("BUILD", Tokens.FONT_SMALL, Tokens.COLOR_TEXT_MUTED))
	header.add_child(make_spacer())
	var cancel_btn := make_button("Cancel", "Ghost")
	cancel_btn.custom_minimum_size = Vector2(96, 36)
	cancel_btn.pressed.connect(_on_cancel)
	header.add_child(cancel_btn)

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.custom_minimum_size.y = _bar_height()
	vbox.add_child(_scroll)

	_row = HBoxContainer.new()
	_row.add_theme_constant_override("separation", Tokens.SPACE_SM)
	_scroll.add_child(_row)

	_rebuild_buttons()

func _bar_height() -> int:
	var bp := get_node_or_null("/root/Bp")
	if bp:
		return int(bp.pick(Tokens.BUILD_BAR_HEIGHT, 112))
	return 112

func _rebuild_buttons() -> void:
	for child in _row.get_children():
		child.queue_free()
	_buttons.clear()
	for t in towers:
		_row.add_child(_tower_button(t))

func _tower_button(t: Dictionary) -> Control:
	var card := Button.new()
	card.theme_type_variation = "ButtonIcon"
	card.toggle_mode = true
	card.focus_mode = Control.FOCUS_ALL
	card.custom_minimum_size = Vector2(_bar_height() - 16, _bar_height() - 16)
	card.tooltip_text = "%s · %d gold" % [t["label"], int(t["cost"])]
	card.pressed.connect(_on_tower_pressed.bind(String(t["id"])))

	var vb := VBoxContainer.new()
	vb.set_anchors_preset(Control.PRESET_FULL_RECT)
	vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_theme_constant_override("separation", 2)
	card.add_child(vb)

	var icon := make_label(String(t["icon"]), Tokens.FONT_H1, t["accent"])
	icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(icon)

	var label := make_label(String(t["label"]), Tokens.FONT_SMALL, Tokens.COLOR_TEXT)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(label)

	var cost := make_label("%d⛁" % int(t["cost"]), Tokens.FONT_SMALL, Tokens.COLOR_WARN)
	cost.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cost.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(cost)

	_buttons[String(t["id"])] = {"button": card, "cost": int(t["cost"]), "icon": icon, "label": label, "cost_label": cost}
	_refresh_affordability_for(String(t["id"]))
	return card

func _refresh_affordability() -> void:
	for id in _buttons.keys():
		_refresh_affordability_for(id)

func _refresh_affordability_for(id: String) -> void:
	var entry: Dictionary = _buttons[id]
	var afford: bool = gold >= entry["cost"]
	entry["button"].disabled = not afford
	entry["cost_label"].modulate.a = 1.0 if afford else 0.5

func _on_tower_pressed(id: String) -> void:
	if selected_id == id:
		selected_id = ""
		_buttons[id]["button"].button_pressed = false
		tower_canceled.emit()
		panel_event.emit("tower_canceled", null)
		return
	if selected_id != "" and _buttons.has(selected_id):
		_buttons[selected_id]["button"].button_pressed = false
	selected_id = id
	tower_selected.emit(id)
	panel_event.emit("tower_selected", id)

func _on_cancel() -> void:
	if selected_id == "" or not _buttons.has(selected_id):
		return
	_buttons[selected_id]["button"].button_pressed = false
	selected_id = ""
	tower_canceled.emit()
	panel_event.emit("tower_canceled", null)

func clear_selection() -> void:
	if selected_id == "":
		return
	if _buttons.has(selected_id):
		_buttons[selected_id]["button"].button_pressed = false
	selected_id = ""

func _on_breakpoint(_klass: int) -> void:
	if _root_margin:
		_root_margin.add_theme_constant_override("margin_left", safe_margin())
		_root_margin.add_theme_constant_override("margin_right", safe_margin())
		_root_margin.add_theme_constant_override("margin_bottom", safe_margin())
	if _scroll:
		_scroll.custom_minimum_size.y = _bar_height()
	_rebuild_buttons()

func apply(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	if data.has("towers"):
		towers = data["towers"]
		_rebuild_buttons()
	if data.has("gold"):
		gold = int(data["gold"])
		_refresh_affordability()
