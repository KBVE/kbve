class_name MenuPage
extends MarginContainer


var uv: Rect2
var box: VBoxContainer

var _rows: Array[SettingCycler] = []
var _buttons: Array[Dictionary] = []
var _hints: Array[Dictionary] = []
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


func pair_with(other: MenuPage) -> void:
	_spread = [self, other]
	other._spread = [self, other]


func add_cycler(label_key: String, names: Callable, get_index: Callable,
		set_index: Callable, count: int, hint_key: String = "") -> SettingCycler:
	var row := SettingCycler.make(label_key, names, get_index, set_index, count)
	row.cycled.connect(_refresh_spread)
	_rows.append(row)
	_scaled.append_array(row.scalables())
	box.add_child(row)
	_hint(row, hint_key)
	return row


func add_button(key: String, action: Callable, hint_key: String = "") -> PaperButton:
	var b := PaperButton.make(I18n.t(key), action)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.clip_text = true
	_buttons.append({"button": b, "key": key})
	_scaled.append(b)
	box.add_child(b)
	_hint(b, hint_key)
	return b


func _hint(row: Control, key: String) -> void:
	if key == "" or MenuStyle.touch:
		return
	_hints.append({"row": row, "key": key})
	_apply_hint(row, I18n.t(key))


func _apply_hint(row: Control, text: String) -> void:
	row.tooltip_text = text
	for child in row.find_children("", "Control", true, false):
		(child as Control).tooltip_text = text


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
		control.custom_minimum_size = Vector2(0.0, metrics.h)
		control.add_theme_font_size_override("font_size", metrics.font)


func refresh() -> void:
	for row in _rows:
		row.refresh()


func retranslate() -> void:
	for row in _rows:
		row.retranslate()
	for entry in _buttons:
		var button: PaperButton = entry["button"]
		if is_instance_valid(button):
			button.text = I18n.t(str(entry["key"]))
	for entry in _hints:
		var row: Control = entry["row"]
		if is_instance_valid(row):
			_apply_hint(row, I18n.t(str(entry["key"])))


func _refresh_spread() -> void:
	if _spread.is_empty():
		refresh()
		return
	for page in _spread:
		page.refresh()
