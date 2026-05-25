extends "res://ui/components/panel_base.gd"

var wave: int = 1
var lives: int = 20
var gold: int = 150
var enemies_left: int = 0

var _wave_value: Label
var _lives_value: Label
var _gold_value: Label
var _enemies_value: Label
var _pause_btn: Button
var _root_margin: MarginContainer

func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_PASS

	var dock := VBoxContainer.new()
	dock.set_anchors_preset(Control.PRESET_FULL_RECT)
	dock.alignment = BoxContainer.ALIGNMENT_BEGIN
	dock.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(dock)

	_root_margin = make_margin(safe_margin(), safe_margin() / 2, safe_margin(), 0)
	_root_margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dock.add_child(_root_margin)

	var panel := PanelContainer.new()
	panel.theme_type_variation = "PanelContainerHud"
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_root_margin.add_child(panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", Tokens.SPACE_MD)
	panel.add_child(row)

	row.add_child(_chip("WAVE", str(wave), Tokens.COLOR_ACCENT, "wave"))
	row.add_child(_chip("ENEMIES", str(enemies_left), Tokens.COLOR_TEXT_MUTED, "enemies"))
	row.add_child(make_spacer())
	row.add_child(_chip("LIVES", str(lives), Tokens.COLOR_DANGER, "lives"))
	row.add_child(_chip("GOLD", str(gold), Tokens.COLOR_WARN, "gold"))

	_pause_btn = make_button("II", "Icon")
	_pause_btn.custom_minimum_size = Vector2(44, 44)
	_pause_btn.tooltip_text = "Pause (Esc)"
	_pause_btn.pressed.connect(_on_pause)
	row.add_child(_pause_btn)

func _chip(caption: String, value: String, accent: Color, tag: String) -> Control:
	var box := PanelContainer.new()
	box.theme_type_variation = "PanelContainerGlass"
	var vb := VBoxContainer.new()
	vb.add_theme_constant_override("separation", 0)
	box.add_child(vb)
	var cap := make_label(caption, Tokens.FONT_SMALL, accent)
	cap.add_theme_constant_override("outline_size", 0)
	vb.add_child(cap)
	var val := make_label(value, Tokens.FONT_H2, Tokens.COLOR_TEXT)
	vb.add_child(val)
	match tag:
		"wave": _wave_value = val
		"lives": _lives_value = val
		"gold": _gold_value = val
		"enemies": _enemies_value = val
	return box

func _on_pause() -> void:
	var ui := get_node_or_null("/root/Ui")
	if ui:
		ui.toggle("pause")

func _on_breakpoint(_klass: int) -> void:
	if _root_margin:
		_root_margin.add_theme_constant_override("margin_left", safe_margin())
		_root_margin.add_theme_constant_override("margin_right", safe_margin())
	_refresh_fonts()

func _refresh_fonts() -> void:
	for label in [_wave_value, _lives_value, _gold_value, _enemies_value]:
		if label:
			label.add_theme_font_size_override("font_size", font_size(Tokens.FONT_H2))

func apply(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	if data.has("wave"):
		wave = int(data["wave"])
		if _wave_value: _wave_value.text = str(wave)
	if data.has("lives"):
		lives = int(data["lives"])
		if _lives_value: _lives_value.text = str(lives)
	if data.has("gold"):
		gold = int(data["gold"])
		if _gold_value: _gold_value.text = str(gold)
	if data.has("enemies"):
		enemies_left = int(data["enemies"])
		if _enemies_value: _enemies_value.text = str(enemies_left)
