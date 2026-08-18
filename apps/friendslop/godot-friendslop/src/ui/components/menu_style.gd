class_name MenuStyle
extends RefCounted


static var touch := false

const LAYOUT_HEIGHT := 720.0
const SCALE_RANGE := Vector2(0.8, 1.7)
const TOUCH_MIN_SCALE := 1.25

const BUTTON_MIN := Vector2(220, 48)
const BUTTON_FONT := 22
const BUTTON_PAD := Vector2(20.0, 6.0)
const BUTTON_RADIUS := 8
const REPLY_PAD := Vector2(22.0, 11.0)
const REPLY_FONT := 19
const REPLY_MIN_H := 38.0

const INK := Color(0.25, 0.16, 0.08)
const INK_HOVER := Color(0.45, 0.2, 0.05)
const INK_PRESSED := Color(0.1, 0.06, 0.03)
const PAPER := Color(0.93, 0.87, 0.72, 0.55)
const PAPER_HOVER := Color(0.97, 0.9, 0.72, 0.8)
const PAPER_PRESSED := Color(0.8, 0.72, 0.55, 0.85)

const PAGE_LEFT_UV := Rect2(-1.161, 0.250, 1.429, 0.570)
const PAGE_RIGHT_UV := Rect2(0.732, 0.421, 1.429, 0.570)
const PAGE_BORDER := false

const PAGE_PAD_TOUCH := Vector2(0.23, 0.03)
const ROW_H_UV := 0.067
const ROW_H_UV_TOUCH := 0.095
const ROW_H_RANGE := Vector2(26.0, 64.0)
const ROW_H_RANGE_TOUCH := Vector2(44.0, 82.0)
const ROW_FONT_RATIO := 0.5
const ROW_FONT_RATIO_TOUCH := 0.44
const ROW_FONT_RANGE := Vector2i(13, 32)

const TEXT_OUTLINE := Color(0.06, 0.045, 0.035, 0.85)
const TEXT_SHADOW := Color(0.05, 0.03, 0.02, 0.9)

enum Side { LEFT, RIGHT }


static func detect() -> void:
	touch = DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")


static func ui_scale(viewport: Viewport) -> float:
	if viewport == null:
		return 1.0
	var view := viewport.get_visible_rect().size
	var s := clampf(view.y / LAYOUT_HEIGHT, SCALE_RANGE.x, SCALE_RANGE.y)
	return maxf(s, TOUCH_MIN_SCALE) if touch else s


static func safe_insets(viewport: Viewport) -> Vector4:
	if viewport == null:
		return Vector4.ZERO
	var screen := Vector2(DisplayServer.window_get_size())
	var view := viewport.get_visible_rect().size
	if screen.x <= 0.0 or screen.y <= 0.0 or view.x <= 0.0 or view.y <= 0.0:
		return Vector4.ZERO
	var safe := DisplayServer.get_display_safe_area()
	if safe.size.x <= 0 or safe.size.y <= 0:
		return Vector4.ZERO
	var per_unit := view / screen
	return Vector4(
		maxf(0.0, float(safe.position.x)) * per_unit.x,
		maxf(0.0, float(safe.position.y)) * per_unit.y,
		maxf(0.0, screen.x - float(safe.position.x + safe.size.x)) * per_unit.x,
		maxf(0.0, screen.y - float(safe.position.y + safe.size.y)) * per_unit.y)


static func plate(fill: Color, radius: int, shadow := 0, pad := Vector2.ZERO) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.set_corner_radius_all(radius)
	if shadow > 0:
		box.shadow_size = shadow
		box.shadow_color = Color(0.0, 0.0, 0.0, 0.45)
	if pad != Vector2.ZERO:
		box.content_margin_left = pad.x
		box.content_margin_right = pad.x
		box.content_margin_top = pad.y
		box.content_margin_bottom = pad.y
	return box


static func page_uv(side: int) -> Rect2:
	var uv: Rect2 = PAGE_LEFT_UV if side == Side.LEFT else PAGE_RIGHT_UV
	if touch:
		uv = uv.grow_individual(PAGE_PAD_TOUCH.x, PAGE_PAD_TOUCH.y,
				PAGE_PAD_TOUCH.x, PAGE_PAD_TOUCH.y)
	return uv


static func row_metrics(book_height: float, root_height: float) -> Dictionary:
	var limits := ROW_H_RANGE_TOUCH if touch else ROW_H_RANGE
	var row_uv := ROW_H_UV_TOUCH if touch else ROW_H_UV
	var font_ratio := ROW_FONT_RATIO_TOUCH if touch else ROW_FONT_RATIO
	var h := clampf(book_height * row_uv * root_height, limits.x, limits.y)
	return {
		"h": h,
		"font": clampi(int(round(h * font_ratio)), ROW_FONT_RANGE.x, ROW_FONT_RANGE.y),
	}


const PAPER_EDGE := Color(0.42, 0.31, 0.18, 0.5)
const PAPER_SHADOW := Color(0.16, 0.11, 0.06, 0.3)


static func button_styles(pad := BUTTON_PAD) -> Dictionary:
	var normal := StyleBoxFlat.new()
	normal.bg_color = PAPER
	normal.set_corner_radius_all(BUTTON_RADIUS)
	normal.content_margin_left = pad.x
	normal.content_margin_right = pad.x
	normal.content_margin_top = pad.y
	normal.content_margin_bottom = pad.y
	normal.set_border_width_all(1)
	normal.border_color = PAPER_EDGE
	normal.shadow_color = PAPER_SHADOW
	normal.shadow_size = 3
	normal.shadow_offset = Vector2(0.0, 2.0)

	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = PAPER_HOVER
	hover.expand_margin_left = 3.0
	hover.expand_margin_right = 3.0
	hover.shadow_size = 5

	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = PAPER_PRESSED
	pressed.shadow_size = 2
	pressed.shadow_offset = Vector2(0.0, 1.0)
	return {"normal": normal, "hover": hover, "pressed": pressed}
