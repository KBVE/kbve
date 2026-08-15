class_name PaperButton
extends Button


## A menu button: one of a stack of equal slabs, so it takes a set width and centres what
## it says.
static func make(text: String, action: Callable) -> PaperButton:
	var b := _paper(text, action, MenuStyle.BUTTON_FONT, MenuStyle.BUTTON_PAD)
	b.custom_minimum_size = MenuStyle.BUTTON_MIN
	return b


## A spoken reply: one of a list rather than one of a stack, so it takes only the width of
## what it says and lines its text up with the replies above and below it.
static func reply(text: String, action: Callable) -> PaperButton:
	var b := _paper(text, action, MenuStyle.REPLY_FONT, MenuStyle.REPLY_PAD)
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.custom_minimum_size = Vector2(0.0, MenuStyle.REPLY_MIN_H)
	return b


static func _paper(text: String, action: Callable, font: int, pad: Vector2) -> PaperButton:
	var b := PaperButton.new()
	b.text = text
	b.add_theme_font_size_override("font_size", font)
	b.add_theme_color_override("font_color", MenuStyle.INK)
	b.add_theme_color_override("font_hover_color", MenuStyle.INK_HOVER)
	b.add_theme_color_override("font_pressed_color", MenuStyle.INK_PRESSED)
	b.add_theme_color_override("font_focus_color", MenuStyle.INK_HOVER)
	var styles := MenuStyle.button_styles(pad)
	b.add_theme_stylebox_override("normal", styles.normal)
	b.add_theme_stylebox_override("hover", styles.hover)
	b.add_theme_stylebox_override("pressed", styles.pressed)
	## Focus wears the hover look, or a reply reached by the keyboard is the one reply that
	## does not light up.
	b.add_theme_stylebox_override("focus", styles.hover)
	if action.is_valid():
		b.pressed.connect(action)
	return b
