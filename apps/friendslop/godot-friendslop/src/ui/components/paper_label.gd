class_name PaperLabel
extends Label


static func hud(text: String, font: int, tint: Color) -> PaperLabel:
	var label := PaperLabel.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font)
	label.add_theme_color_override("font_color", tint)
	label.add_theme_constant_override("outline_size", 4)
	label.add_theme_color_override("font_outline_color", MenuStyle.TEXT_OUTLINE)
	return label


static func card(font: int, tint: Color = MenuStyle.PAPER_HOVER) -> PaperLabel:
	var label := PaperLabel.new()
	label.add_theme_font_size_override("font_size", font)
	label.add_theme_color_override("font_color", tint)
	label.add_theme_color_override("font_shadow_color", MenuStyle.TEXT_SHADOW)
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	return label


func _make_custom_tooltip(for_text: String) -> Object:
	return MenuStyle.tooltip(for_text, MenuStyle.ui_scale(get_viewport()))
