class_name PaperButton
extends Button



static func make(text: String, action: Callable) -> PaperButton:
	var b := PaperButton.new()
	b.text = text
	b.custom_minimum_size = MenuStyle.BUTTON_MIN
	b.add_theme_font_size_override("font_size", MenuStyle.BUTTON_FONT)
	b.add_theme_color_override("font_color", MenuStyle.INK)
	b.add_theme_color_override("font_hover_color", MenuStyle.INK_HOVER)
	b.add_theme_color_override("font_pressed_color", MenuStyle.INK_PRESSED)
	var styles := MenuStyle.button_styles()
	b.add_theme_stylebox_override("normal", styles.normal)
	b.add_theme_stylebox_override("hover", styles.hover)
	b.add_theme_stylebox_override("pressed", styles.pressed)
	if action.is_valid():
		b.pressed.connect(action)
	return b
