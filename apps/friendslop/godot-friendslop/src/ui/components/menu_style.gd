class_name MenuStyle
extends RefCounted

## Every touch-vs-desktop decision in the menu, in one place.
##
## `touch` is a static var rather than a parameter because it is a property of
## the device, not of any one control -- threading it through each factory is how
## the sizing drifted before.

static var touch := false

const BUTTON_MIN := Vector2(220, 48)
const BUTTON_FONT := 22

const INK := Color(0.25, 0.16, 0.08)
const INK_HOVER := Color(0.45, 0.2, 0.05)
const INK_PRESSED := Color(0.1, 0.06, 0.03)
const PAPER := Color(0.93, 0.87, 0.72, 0.55)
const PAPER_HOVER := Color(0.97, 0.9, 0.72, 0.8)
const PAPER_PRESSED := Color(0.8, 0.72, 0.55, 0.85)

## Pages are measured against the projected book rather than the screen, so they
## hold at any window size and survive a change to the book's framing. The
## reference frame is the projected bounds of the book mesh -- the closed bind
## pose, narrower than the open spread, hence values outside 0..1 on x. What
## matters is that it moves with the book. Flip PAGE_BORDER to see them.
const PAGE_LEFT_UV := Rect2(-1.161, 0.250, 1.429, 0.570)
const PAGE_RIGHT_UV := Rect2(0.732, 0.421, 1.429, 0.570)
const PAGE_BORDER := false

## Touch gets wider pages and taller rows: the margins that read as comfortable
## on a desktop window leave the rows squeezed under a thumb.
const PAGE_PAD_TOUCH := Vector2(0.23, 0.03)
## Row height as a fraction of the projected book height, clamped so a tiny
## window still gets a hittable row and a 4K one does not get slabs. Apple and
## Android both put the minimum comfortable touch target near 44pt.
const ROW_H_UV := 0.067
const ROW_H_UV_TOUCH := 0.095
const ROW_H_RANGE := Vector2(26.0, 64.0)
const ROW_H_RANGE_TOUCH := Vector2(44.0, 82.0)
const ROW_FONT_RATIO := 0.5
const ROW_FONT_RATIO_TOUCH := 0.44
const ROW_FONT_RANGE := Vector2i(13, 32)

enum Side { LEFT, RIGHT }


static func detect() -> void:
	touch = DisplayServer.is_touchscreen_available() or OS.has_feature("mobile")


## Typed int, not Side: GDScript will not unify the inner `Side` with the
## `MenuStyle.Side` a caller writes, so the enum stays for the call site only.
static func page_uv(side: int) -> Rect2:
	var uv: Rect2 = PAGE_LEFT_UV if side == Side.LEFT else PAGE_RIGHT_UV
	if touch:
		uv = uv.grow_individual(PAGE_PAD_TOUCH.x, PAGE_PAD_TOUCH.y,
				PAGE_PAD_TOUCH.x, PAGE_PAD_TOUCH.y)
	return uv


## Row height and font for the current projection, so every page scales its rows
## from one rule instead of each caller re-deriving it.
static func row_metrics(book_height: float, root_height: float) -> Dictionary:
	var limits := ROW_H_RANGE_TOUCH if touch else ROW_H_RANGE
	var row_uv := ROW_H_UV_TOUCH if touch else ROW_H_UV
	var font_ratio := ROW_FONT_RATIO_TOUCH if touch else ROW_FONT_RATIO
	var h := clampf(book_height * row_uv * root_height, limits.x, limits.y)
	return {
		"h": h,
		"font": clampi(int(round(h * font_ratio)), ROW_FONT_RANGE.x, ROW_FONT_RANGE.y),
	}


## The paper-and-ink button look, as three styleboxes sharing one shape.
static func button_styles() -> Dictionary:
	var normal := StyleBoxFlat.new()
	normal.bg_color = PAPER
	normal.corner_radius_top_left = 6
	normal.corner_radius_top_right = 6
	normal.corner_radius_bottom_left = 6
	normal.corner_radius_bottom_right = 6
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = PAPER_HOVER
	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = PAPER_PRESSED
	return {"normal": normal, "hover": hover, "pressed": pressed}
