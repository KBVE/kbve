extends "res://ui/components/panel_base.gd"

const NUMBER_TWEEN_DURATION := 0.32
const FLASH_DURATION := 0.12
const FLASH_FADE_DURATION := 0.28
const PUNCH_SCALE := 1.18
const PUNCH_DURATION := 0.22

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
var _chip_boxes: Dictionary = {}
var _active_tweens: Dictionary = {}

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
	_chip_boxes[tag] = box
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

func _stop_tween(key: String) -> void:
	var tw: Variant = _active_tweens.get(key)
	if tw != null and tw is Tween and (tw as Tween).is_valid():
		(tw as Tween).kill()
	_active_tweens.erase(key)

func _register_tween(key: String, tw: Tween) -> void:
	_active_tweens[key] = tw
	tw.finished.connect(func() -> void:
		if _active_tweens.get(key) == tw:
			_active_tweens.erase(key)
	)

func _tween_int(label: Label, from_val: int, to_val: int, key: String) -> void:
	if label == null or from_val == to_val:
		if label != null:
			label.text = str(to_val)
		return
	_stop_tween(key)
	label.text = str(from_val)
	var tw := create_tween()
	tw.tween_method(func(v: float) -> void:
		if is_instance_valid(label):
			label.text = str(int(round(v)))
	, float(from_val), float(to_val), NUMBER_TWEEN_DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func() -> void:
		if is_instance_valid(label):
			label.text = str(to_val)
	)
	_register_tween(key, tw)

func _punch_chip(tag: String) -> void:
	var box: Control = _chip_boxes.get(tag)
	if box == null:
		return
	var key := "punch_" + tag
	_stop_tween(key)
	box.pivot_offset = box.size / 2.0
	box.scale = Vector2(PUNCH_SCALE, PUNCH_SCALE)
	var tw := create_tween()
	tw.tween_property(box, "scale", Vector2.ONE, PUNCH_DURATION).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_register_tween(key, tw)

func _flash_chip(tag: String, flash_color: Color) -> void:
	var box: Control = _chip_boxes.get(tag)
	if box == null:
		return
	var key := "flash_" + tag
	_stop_tween(key)
	var tw := create_tween()
	tw.tween_property(box, "modulate", flash_color, FLASH_DURATION).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(box, "modulate", Color.WHITE, FLASH_FADE_DURATION).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	_register_tween(key, tw)

func apply(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	if data.has("wave"):
		var prev: int = wave
		wave = int(data["wave"])
		_tween_int(_wave_value, prev, wave, "wave")
		if wave != prev:
			_punch_chip("wave")
			_flash_chip("wave", Color(Tokens.COLOR_ACCENT.r, Tokens.COLOR_ACCENT.g, Tokens.COLOR_ACCENT.b, 1.0).lightened(0.2))
	if data.has("lives"):
		var prev_lives: int = lives
		lives = int(data["lives"])
		_tween_int(_lives_value, prev_lives, lives, "lives")
		if lives < prev_lives:
			_flash_chip("lives", Tokens.COLOR_DANGER)
			_punch_chip("lives")
	if data.has("gold"):
		var prev_gold: int = gold
		gold = int(data["gold"])
		_tween_int(_gold_value, prev_gold, gold, "gold")
		if gold > prev_gold:
			_flash_chip("gold", Tokens.COLOR_WARN.lightened(0.2))
			_punch_chip("gold")
	if data.has("enemies"):
		var prev_enemies: int = enemies_left
		enemies_left = int(data["enemies"])
		_tween_int(_enemies_value, prev_enemies, enemies_left, "enemies")
