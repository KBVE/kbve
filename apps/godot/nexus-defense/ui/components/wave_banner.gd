extends "res://ui/components/panel_base.gd"

var title_text: String = "Wave 1"
var subtitle_text: String = "12 enemies incoming"
var duration: float = 2.4

var _title: Label
var _subtitle: Label
var _panel: PanelContainer

func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	_panel = PanelContainer.new()
	_panel.theme_type_variation = "PanelContainerGlass"
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(_panel)

	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_theme_constant_override("separation", Tokens.SPACE_SM)
	_panel.add_child(vb)

	_title = make_label(title_text, Tokens.FONT_DISPLAY, Tokens.COLOR_ACCENT)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_constant_override("outline_size", 6)
	vb.add_child(_title)

	_subtitle = make_label(subtitle_text, Tokens.FONT_H2, Tokens.COLOR_TEXT_MUTED)
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(_subtitle)

func open_anim() -> void:
	modulate.a = 0.0
	scale = Vector2(0.92, 0.92)
	pivot_offset = size / 2
	var tw := create_tween().set_parallel(true)
	tw.tween_property(self, "modulate:a", 1.0, Tokens.ANIM_MED)
	tw.tween_property(self, "scale", Vector2.ONE, Tokens.ANIM_MED).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await tw.finished
	await get_tree().create_timer(duration).timeout
	var ui := get_node_or_null("/root/Ui")
	if ui:
		ui.close("wave_banner")

func close_anim() -> void:
	var tw := create_tween().set_parallel(true)
	tw.tween_property(self, "modulate:a", 0.0, Tokens.ANIM_FAST)
	tw.tween_property(self, "scale", Vector2(0.96, 0.96), Tokens.ANIM_FAST)
	await tw.finished

func apply(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	if data.has("title"):
		title_text = String(data["title"])
		if _title: _title.text = title_text
	if data.has("subtitle"):
		subtitle_text = String(data["subtitle"])
		if _subtitle: _subtitle.text = subtitle_text
	if data.has("duration"):
		duration = float(data["duration"])
