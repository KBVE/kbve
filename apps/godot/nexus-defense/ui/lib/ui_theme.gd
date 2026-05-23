class_name UiTheme
extends RefCounted

const T := preload("res://ui/lib/tokens.gd")

static func build() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = 16

	_apply_panel(theme)
	_apply_label(theme)
	_apply_button(theme, "", T.COLOR_SURFACE_ALT, T.COLOR_OUTLINE, T.COLOR_ACCENT, T.COLOR_TEXT)
	_apply_button(theme, "Primary", T.COLOR_ACCENT, T.COLOR_ACCENT, T.COLOR_ACCENT_HOVER, T.COLOR_BG)
	_apply_button(theme, "Danger", T.COLOR_DANGER, T.COLOR_DANGER, T.COLOR_DANGER.lightened(0.15), T.COLOR_TEXT)
	_apply_button(theme, "Ghost", Color(0, 0, 0, 0), T.COLOR_OUTLINE, T.COLOR_ACCENT, T.COLOR_TEXT)
	_apply_button(theme, "Icon", T.COLOR_SURFACE, T.COLOR_OUTLINE, T.COLOR_ACCENT, T.COLOR_TEXT)
	_apply_progress(theme)
	_apply_panel_variants(theme)
	return theme

static func stylebox(color: Color, radius: int = T.RADIUS_MD, border: int = 0, border_color: Color = T.COLOR_OUTLINE, pad: int = 12) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.corner_radius_top_left = radius
	sb.corner_radius_top_right = radius
	sb.corner_radius_bottom_left = radius
	sb.corner_radius_bottom_right = radius
	if border > 0:
		sb.border_width_top = border
		sb.border_width_bottom = border
		sb.border_width_left = border
		sb.border_width_right = border
		sb.border_color = border_color
	sb.content_margin_top = pad
	sb.content_margin_bottom = pad
	sb.content_margin_left = pad + 4
	sb.content_margin_right = pad + 4
	return sb

static func _apply_panel(theme: Theme) -> void:
	theme.set_stylebox("panel", "PanelContainer", stylebox(T.COLOR_SURFACE, T.RADIUS_MD, 1, T.COLOR_OUTLINE))
	theme.set_stylebox("panel", "Panel", stylebox(T.COLOR_SURFACE, T.RADIUS_MD, 1, T.COLOR_OUTLINE))

static func _apply_label(theme: Theme) -> void:
	theme.set_color("font_color", "Label", T.COLOR_TEXT)
	theme.set_color("font_outline_color", "Label", Color(0, 0, 0, 0.55))
	theme.set_constant("outline_size", "Label", 0)

static func _apply_button(theme: Theme, variant: String, bg: Color, border_color: Color, accent: Color, text: Color) -> void:
	var node_class := "Button"
	if variant != "":
		node_class = "Button" + variant
		theme.set_type_variation(node_class, "Button")
	var border := 1 if variant == "Ghost" else 0
	var pad := 10
	var normal := stylebox(bg, T.RADIUS_MD, border, border_color, pad)
	var hover := stylebox(accent, T.RADIUS_MD, 0, accent, pad)
	var pressed := stylebox(bg.darkened(0.12), T.RADIUS_MD, 0, border_color, pad)
	var focus := stylebox(bg, T.RADIUS_MD, 2, accent, pad)
	var disabled := stylebox(bg.darkened(0.35), T.RADIUS_MD, 0, border_color, pad)
	theme.set_stylebox("normal", node_class, normal)
	theme.set_stylebox("hover", node_class, hover)
	theme.set_stylebox("pressed", node_class, pressed)
	theme.set_stylebox("focus", node_class, focus)
	theme.set_stylebox("disabled", node_class, disabled)
	theme.set_color("font_color", node_class, text)
	theme.set_color("font_hover_color", node_class, T.COLOR_BG if variant == "Primary" else text)
	theme.set_color("font_pressed_color", node_class, text)
	theme.set_color("font_disabled_color", node_class, T.COLOR_TEXT_MUTED)

static func _apply_progress(theme: Theme) -> void:
	var bg := stylebox(T.COLOR_SURFACE_ALT, T.RADIUS_PILL, 0, T.COLOR_OUTLINE, 0)
	bg.content_margin_top = 0
	bg.content_margin_bottom = 0
	bg.content_margin_left = 0
	bg.content_margin_right = 0
	var fill := stylebox(T.COLOR_ACCENT, T.RADIUS_PILL, 0, T.COLOR_ACCENT, 0)
	fill.content_margin_top = 0
	fill.content_margin_bottom = 0
	fill.content_margin_left = 0
	fill.content_margin_right = 0
	theme.set_stylebox("background", "ProgressBar", bg)
	theme.set_stylebox("fill", "ProgressBar", fill)
	theme.set_color("font_color", "ProgressBar", T.COLOR_TEXT)

static func _apply_panel_variants(theme: Theme) -> void:
	for variant in ["Glass", "Toast", "Modal", "Hud"]:
		var variant_name: String = "PanelContainer" + String(variant)
		theme.set_type_variation(variant_name, "PanelContainer")
	theme.set_stylebox("panel", "PanelContainerGlass", stylebox(Color(T.COLOR_SURFACE.r, T.COLOR_SURFACE.g, T.COLOR_SURFACE.b, 0.78), T.RADIUS_LG, 1, T.COLOR_OUTLINE))
	theme.set_stylebox("panel", "PanelContainerToast", stylebox(T.COLOR_SURFACE_ALT, T.RADIUS_MD, 1, T.COLOR_ACCENT))
	theme.set_stylebox("panel", "PanelContainerModal", stylebox(T.COLOR_SURFACE, T.RADIUS_LG, 1, T.COLOR_OUTLINE, 24))
	theme.set_stylebox("panel", "PanelContainerHud", stylebox(Color(T.COLOR_BG.r, T.COLOR_BG.g, T.COLOR_BG.b, 0.65), T.RADIUS_MD, 1, T.COLOR_OUTLINE, 10))
