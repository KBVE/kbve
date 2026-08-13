class_name LanguageModal
extends CanvasLayer

## The first question the game asks, once, before anything else is legible.

signal chosen(code: String)

const HEADINGS := ["Language", "Idioma", "भाषा", "言語"]

var buttons: Array[PaperButton] = []

var _root: Control


func _ready() -> void:
	layer = 130
	process_mode = Node.PROCESS_MODE_ALWAYS
	MenuStyle.detect()
	I18n.use_all_fonts()
	_build()


func _build() -> void:
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_root)

	var dim := ColorRect.new()
	dim.color = Color(0.06, 0.05, 0.04, 0.92)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(dim)

	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 10 if MenuStyle.touch else 8)
	column.anchor_left = 0.5
	column.anchor_right = 0.5
	column.anchor_top = 0.5
	column.anchor_bottom = 0.5
	column.grow_horizontal = Control.GROW_DIRECTION_BOTH
	column.grow_vertical = Control.GROW_DIRECTION_BOTH
	_root.add_child(column)

	var heading := Label.new()
	heading.text = " · ".join(HEADINGS)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 20)
	heading.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	column.add_child(heading)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 18)
	column.add_child(spacer)

	for entry: Dictionary in I18n.locales():
		var code: String = entry["code"]
		var button := PaperButton.make(str(entry["name"]),
				func() -> void: _choose(code))
		button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		button.custom_minimum_size = Vector2(
				MenuStyle.BUTTON_MIN.x * (1.4 if MenuStyle.touch else 1.2),
				MenuStyle.BUTTON_MIN.y * (1.25 if MenuStyle.touch else 1.0))
		column.add_child(button)
		buttons.append(button)


## Written to disk here rather than by the caller: the modal exists precisely to turn a
## guess into an answer, and an answer that is not saved brings the modal back on the
## next launch.
func _choose(code: String) -> void:
	I18n.set_locale(code, true)
	chosen.emit(code)


## No escape hatch.
func _input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
