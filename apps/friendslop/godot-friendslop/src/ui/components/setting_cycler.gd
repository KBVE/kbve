class_name SettingCycler
extends HBoxContainer


signal cycled

var _names: Callable
var _get_index: Callable
var _set_index: Callable
var _count := 0
var _label: Label
var _value: PaperButton


static func make(label: String, names: Callable, get_index: Callable,
		set_index: Callable, count: int) -> SettingCycler:
	var row := SettingCycler.new()
	row._names = names
	row._get_index = get_index
	row._set_index = set_index
	row._count = maxi(count, 1)
	row.add_theme_constant_override("separation", 8)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var name_label := Label.new()
	name_label.text = label
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.size_flags_stretch_ratio = 1.1
	name_label.add_theme_color_override("font_color", MenuStyle.INK)
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	name_label.clip_text = true
	row._label = name_label
	row.add_child(name_label)

	row._value = PaperButton.make("", Callable())
	row._value.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row._value.clip_text = true
	row._value.pressed.connect(row._advance)
	row.add_child(row._value)
	return row


func refresh() -> void:
	var list: Array = _names.call()
	if list.is_empty():
		return
	var i: int = clampi(_get_index.call(), 0, list.size() - 1)
	_value.text = str(list[i])


func scalables() -> Array[Control]:
	return [_label, _value]


func _advance() -> void:
	_set_index.call((int(_get_index.call()) + 1) % _count)
	refresh()
	cycled.emit()
