class_name PaperButton
extends Button


static func make(text: String, action: Callable) -> PaperButton:
	var b := _paper(text, action, MenuStyle.BUTTON_FONT, MenuStyle.BUTTON_PAD)
	b.custom_minimum_size = MenuStyle.BUTTON_MIN
	return b


static func reply(text: String, action: Callable) -> PaperButton:
	var b := _paper(text, action, MenuStyle.REPLY_FONT, MenuStyle.REPLY_PAD)
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.custom_minimum_size = Vector2(0.0, MenuStyle.REPLY_MIN_H)
	return b


static func branded(text: String, action: Callable, tint: Color, icon: Texture2D) -> PaperButton:
	var b := make(text, action)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(state, Color(1, 1, 1))
	for state in ["normal", "hover", "pressed", "focus"]:
		var box := StyleBoxFlat.new()
		box.bg_color = tint.lightened(0.08) if state != "normal" else tint
		box.set_corner_radius_all(6)
		box.content_margin_left = MenuStyle.BUTTON_PAD.x
		box.content_margin_right = MenuStyle.BUTTON_PAD.x
		box.content_margin_top = MenuStyle.BUTTON_PAD.y
		box.content_margin_bottom = MenuStyle.BUTTON_PAD.y
		b.add_theme_stylebox_override(state, box)
	if icon:
		b.icon = icon
		b.add_theme_constant_override("h_separation", 10)
		b.expand_icon = false
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
	b.add_theme_stylebox_override("focus", styles.hover)
	if action.is_valid():
		b.pressed.connect(action)
	return b


func _make_custom_tooltip(for_text: String) -> Object:
	return MenuStyle.tooltip(for_text, MenuStyle.ui_scale(get_viewport()))
