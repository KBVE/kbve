class_name MenuStyle
extends RefCounted

## Every touch-vs-desktop decision in the menu, in one place.

static var touch := false

const BUTTON_MIN := Vector2(220, 48)
const BUTTON_FONT := 22
## Room around the words. Wider than it is tall, because text crowded against a rounded
## edge reads as a mistake and the corners are what eat the room.
##
## Kept shallow: a stylebox margin counts towards a control's minimum height, and the
## settings rows scale down to ROW_H_RANGE.x on a small window. Generous padding here
## would quietly stop them shrinking.
const BUTTON_PAD := Vector2(20.0, 6.0)
const BUTTON_RADIUS := 8
## A spoken reply is read at a glance beside the line above it, so it sits a size under the
## menu's own, takes only the height it needs, and can afford the room a fixed row cannot.
const REPLY_PAD := Vector2(22.0, 11.0)
const REPLY_FONT := 19
const REPLY_MIN_H := 38.0

const INK := Color(0.25, 0.16, 0.08)
const INK_HOVER := Color(0.45, 0.2, 0.05)
const INK_PRESSED := Color(0.1, 0.06, 0.03)
const PAPER := Color(0.93, 0.87, 0.72, 0.55)
const PAPER_HOVER := Color(0.97, 0.9, 0.72, 0.8)
const PAPER_PRESSED := Color(0.8, 0.72, 0.55, 0.85)

## Pages are measured against the projected book rather than the screen, so they hold at
## any window size and survive a change to the book's framing.
const PAGE_LEFT_UV := Rect2(-1.161, 0.250, 1.429, 0.570)
const PAGE_RIGHT_UV := Rect2(0.732, 0.421, 1.429, 0.570)
const PAGE_BORDER := false

## Touch gets wider pages and taller rows: the margins that read as comfortable on a
## desktop window leave the rows squeezed under a thumb.
const PAGE_PAD_TOUCH := Vector2(0.23, 0.03)
## Row height as a fraction of the projected book height, clamped so a tiny window still
## gets a hittable row and a 4K one does not get slabs.
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


## Row height and font for the current projection, so every page scales its rows from
## one rule instead of each caller re-deriving it.
static func row_metrics(book_height: float, root_height: float) -> Dictionary:
	var limits := ROW_H_RANGE_TOUCH if touch else ROW_H_RANGE
	var row_uv := ROW_H_UV_TOUCH if touch else ROW_H_UV
	var font_ratio := ROW_FONT_RATIO_TOUCH if touch else ROW_FONT_RATIO
	var h := clampf(book_height * row_uv * root_height, limits.x, limits.y)
	return {
		"h": h,
		"font": clampi(int(round(h * font_ratio)), ROW_FONT_RANGE.x, ROW_FONT_RANGE.y),
	}


## Ink bled into the edge of the paper, which is what keeps a flat rectangle from reading
## as a web page.
const PAPER_EDGE := Color(0.42, 0.31, 0.18, 0.5)
const PAPER_SHADOW := Color(0.16, 0.11, 0.06, 0.3)


## The paper-and-ink button look, as three styleboxes sharing one shape.
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
	normal.shadow_size = 4
	normal.shadow_offset = Vector2(0.0, 2.0)

	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = PAPER_HOVER
	## Lifts a little under the pointer rather than only changing colour, which is easier
	## to catch out of the corner of an eye.
	hover.expand_margin_left = 3.0
	hover.expand_margin_right = 3.0
	hover.shadow_size = 6

	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = PAPER_PRESSED
	pressed.shadow_size = 2
	pressed.shadow_offset = Vector2(0.0, 1.0)
	return {"normal": normal, "hover": hover, "pressed": pressed}
