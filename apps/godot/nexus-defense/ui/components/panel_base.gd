extends Control

const Tokens := preload("res://ui/lib/tokens.gd")

signal panel_event(event_name: String, payload: Variant)

var _built: bool = false

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	if not _built:
		_built = true
		_build()
	var bp := get_node_or_null("/root/Bp")
	if bp and bp.has_signal("changed") and not bp.changed.is_connected(_on_breakpoint):
		bp.changed.connect(_on_breakpoint)

func _build() -> void:
	pass

func _on_breakpoint(_klass: int) -> void:
	pass

func apply(_data: Variant) -> void:
	pass

func open_anim() -> void:
	modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 1.0, Tokens.ANIM_MED)

func close_anim() -> void:
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, Tokens.ANIM_FAST)
	await tw.finished

func safe_margin() -> int:
	var bp := get_node_or_null("/root/Bp")
	if bp:
		return int(bp.pick(Tokens.SAFE_MARGIN, 16))
	return 16

func font_size(table: Dictionary) -> int:
	var bp := get_node_or_null("/root/Bp")
	if bp:
		return int(bp.font(table))
	return int(table.get("desktop", 16))

func is_touch() -> bool:
	var bp := get_node_or_null("/root/Bp")
	return bp != null and bp.is_touch()

func make_label(txt: String, table: Dictionary = Tokens.FONT_BODY, color: Color = Tokens.COLOR_TEXT) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_size_override("font_size", font_size(table))
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.6))
	l.add_theme_constant_override("outline_size", 4)
	return l

func make_button(txt: String, variant: String = "") -> Button:
	var b := Button.new()
	b.text = txt
	if variant != "":
		b.theme_type_variation = "Button" + variant
	b.custom_minimum_size = Vector2(0, 44)
	b.focus_mode = Control.FOCUS_ALL
	return b

func make_spacer() -> Control:
	var c := Control.new()
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c

func make_margin(left: int, top: int, right: int, bottom: int) -> MarginContainer:
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", left)
	m.add_theme_constant_override("margin_right", right)
	m.add_theme_constant_override("margin_top", top)
	m.add_theme_constant_override("margin_bottom", bottom)
	return m
