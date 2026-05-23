extends "res://ui/components/panel_base.gd"

var _label: Label
var _panel: PanelContainer
var _kind: String = "info"
var _stack_index: int = 0

const TOAST_W := 320
const TOAST_H := 56
const STACK_GAP := 8

func _build() -> void:
	custom_minimum_size = Vector2(TOAST_W, TOAST_H)
	size = Vector2(TOAST_W, TOAST_H)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	_panel = PanelContainer.new()
	_panel.theme_type_variation = "PanelContainerToast"
	_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_panel)

	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", Tokens.SPACE_MD)
	_panel.add_child(hb)

	var dot := ColorRect.new()
	dot.custom_minimum_size = Vector2(6, 0)
	dot.size_flags_vertical = Control.SIZE_EXPAND_FILL
	dot.color = Tokens.COLOR_ACCENT
	hb.add_child(dot)

	_label = make_label("", Tokens.FONT_BODY, Tokens.COLOR_TEXT)
	_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hb.add_child(_label)

func show_toast(message: String, duration: float, kind: String) -> void:
	_label.text = message
	_kind = kind
	var dot: ColorRect = _panel.get_child(0).get_child(0)
	dot.color = _kind_color(kind)
	open_anim()
	await get_tree().create_timer(duration).timeout
	await close_anim()
	queue_free()

func _kind_color(kind: String) -> Color:
	match kind:
		"ok": return Tokens.COLOR_OK
		"warn": return Tokens.COLOR_WARN
		"danger": return Tokens.COLOR_DANGER
		_: return Tokens.COLOR_ACCENT

func position_in_stack(idx: int) -> void:
	_stack_index = idx
	_layout()

func open_anim() -> void:
	modulate.a = 0.0
	var start_x := position.x + 24
	var target_x := position.x
	position.x = start_x
	var tw := create_tween().set_parallel(true)
	tw.tween_property(self, "modulate:a", 1.0, Tokens.ANIM_MED)
	tw.tween_property(self, "position:x", target_x, Tokens.ANIM_MED).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

func close_anim() -> void:
	var tw := create_tween().set_parallel(true)
	tw.tween_property(self, "modulate:a", 0.0, Tokens.ANIM_FAST)
	tw.tween_property(self, "position:x", position.x + 24, Tokens.ANIM_FAST)
	await tw.finished

func _layout() -> void:
	var viewport := get_viewport().get_visible_rect().size
	var margin := safe_margin()
	var bp := get_node_or_null("/root/Bp")
	var top_anchor: float = margin
	if bp and bp.is_mobile():
		position.x = (viewport.x - TOAST_W) / 2
		position.y = top_anchor + (TOAST_H + STACK_GAP) * _stack_index
	else:
		position.x = viewport.x - TOAST_W - margin
		position.y = top_anchor + (TOAST_H + STACK_GAP) * _stack_index

func _on_breakpoint(_klass: int) -> void:
	_layout()

func _ready() -> void:
	super._ready()
	_layout()
