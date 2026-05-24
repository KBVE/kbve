extends "res://ui/components/panel_base.gd"

var title_text: String = "Nexus Defense"
var subtitle_text: String = "Booting systems…"

var _title: Label
var _subtitle: Label
var _spinner: Control
var _spinner_angle: float = 0.0

func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Tokens.COLOR_BG
	add_child(bg)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var vb := VBoxContainer.new()
	vb.alignment = BoxContainer.ALIGNMENT_CENTER
	vb.add_theme_constant_override("separation", Tokens.SPACE_LG)
	center.add_child(vb)

	_title = make_label(title_text, Tokens.FONT_DISPLAY, Tokens.COLOR_ACCENT)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(_title)

	_subtitle = make_label(subtitle_text, Tokens.FONT_H2, Tokens.COLOR_TEXT_MUTED)
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vb.add_child(_subtitle)

	_spinner = Control.new()
	_spinner.custom_minimum_size = Vector2(48, 48)
	_spinner.draw.connect(_draw_spinner)
	vb.add_child(_spinner)

	set_process(true)

func _process(delta: float) -> void:
	_spinner_angle = fposmod(_spinner_angle + delta * TAU * 1.2, TAU)
	_spinner.queue_redraw()

func _draw_spinner() -> void:
	var center := _spinner.size / 2
	var radius := minf(center.x, center.y) - 4
	var arc_color := Tokens.COLOR_ACCENT
	var track_color := Tokens.COLOR_OUTLINE
	_spinner.draw_arc(center, radius, 0.0, TAU, 48, track_color, 4, true)
	_spinner.draw_arc(center, radius, _spinner_angle, _spinner_angle + TAU * 0.35, 32, arc_color, 4, true)

func apply(data: Variant) -> void:
	if typeof(data) != TYPE_DICTIONARY:
		return
	if data.has("title"):
		title_text = String(data["title"])
		if _title: _title.text = title_text
	if data.has("subtitle"):
		subtitle_text = String(data["subtitle"])
		if _subtitle: _subtitle.text = subtitle_text
