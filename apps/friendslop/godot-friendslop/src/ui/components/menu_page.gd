class_name MenuPage
extends MarginContainer

## One writable page of the open book, and the rows on it.

var uv: Rect2
var box: VBoxContainer

var _rows: Array[SettingCycler] = []
var _scaled: Array[Control] = []
var _spread: Array[MenuPage] = []


static func make(side: int, panel: Control) -> MenuPage:
	var page := MenuPage.new()
	page.uv = MenuStyle.page_uv(side)
	page.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(page)

	if MenuStyle.PAGE_BORDER:
		var edge := Panel.new()
		var style := StyleBoxFlat.new()
		style.bg_color = Color(0, 0, 0, 0)
		style.border_color = Color(0.8, 0.2, 0.2, 0.7)
		style.set_border_width_all(1)
		edge.add_theme_stylebox_override("panel", style)
		edge.mouse_filter = Control.MOUSE_FILTER_IGNORE
		edge.set_anchors_preset(Control.PRESET_FULL_RECT)
		page.add_child(edge)

	page.box = VBoxContainer.new()
	page.box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	page.box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.box.alignment = BoxContainer.ALIGNMENT_CENTER
	page.box.add_theme_constant_override("separation", 8)
	page.add_child(page.box)
	return page


## Two pages of one spread share their rows, so a cycle on either refreshes both.
func pair_with(other: MenuPage) -> void:
	_spread = [self, other]
	other._spread = [self, other]


func add_cycler(label: String, names: Callable, get_index: Callable,
		set_index: Callable, count: int, hint: String = "") -> SettingCycler:
	var row := SettingCycler.make(label, names, get_index, set_index, count)
	row.cycled.connect(_refresh_spread)
	_rows.append(row)
	_scaled.append_array(row.scalables())
	box.add_child(row)
	_hint(row, hint)
	return row


func add_button(text: String, action: Callable, hint: String = "") -> PaperButton:
	var b := PaperButton.make(text, action)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.clip_text = true
	_scaled.append(b)
	box.add_child(b)
	_hint(b, hint)
	return b


## What a row does, for anyone who hovers it or reaches it with the keyboard.
##
## A pointer tooltip only: a touch screen has no hover, and a long press to read a label
## fights the tap that would use the row. Mobile is meant to be told by the label itself,
## which is why hints are an explanation rather than the only place a row says what it is.
func _hint(row: Control, text: String) -> void:
	if text == "" or MenuStyle.touch:
		return
	row.tooltip_text = text
	for child in row.find_children("", "Control", true, false):
		(child as Control).tooltip_text = text


## Anchors the page onto the projected book and rescales its rows to match.
func layout(book: Rect2, metrics: Dictionary) -> void:
	anchor_left = book.position.x + book.size.x * uv.position.x
	anchor_top = book.position.y + book.size.y * uv.position.y
	anchor_right = book.position.x + book.size.x * (uv.position.x + uv.size.x)
	anchor_bottom = book.position.y + book.size.y * (uv.position.y + uv.size.y)
	offset_left = 0.0
	offset_top = 0.0
	offset_right = 0.0
	offset_bottom = 0.0
	for control in _scaled:
		## Width is cleared, not just height set. A Control is never drawn smaller than its
		## own minimum, so a row carrying the menu slab's fixed 220 forces the whole page
		## wider than the anchors above -- and a page that outgrows its anchors grows to
		## the right, off the edge of the paper. On a page the row is told how wide it is
		## by the book, so it must ask for nothing.
		control.custom_minimum_size = Vector2(0.0, metrics.h)
		control.add_theme_font_size_override("font_size", metrics.font)


func refresh() -> void:
	for row in _rows:
		row.refresh()


func _refresh_spread() -> void:
	if _spread.is_empty():
		refresh()
		return
	for page in _spread:
		page.refresh()
