class_name OnlineHud
extends CanvasLayer


signal leave_requested

const INK := Color(0.97, 0.94, 0.85)
const WARN := Color(1.0, 0.72, 0.55)

const NOTICE_SECONDS := 4.0

var status_label: Label
var roster_label: Label
var pets_label: Label
var notice_label: Label

var _notice_left := 0.0
var _status_key := ""
var _status_arg := ""
var _roster: Dictionary = {}
var _local_body := 0
var _pets := 0
var _pets_total := -1
var _pets_shown := false


func _ready() -> void:
	layer = 90
	MenuStyle.detect()
	_build()
	I18n.locale_changed.connect(retranslate)


func _build() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 2)
	box.set_anchors_preset(Control.PRESET_TOP_LEFT)
	box.offset_left = 18.0
	box.offset_top = 14.0
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(box)

	status_label = _label(20)
	box.add_child(status_label)
	roster_label = _label(15)
	box.add_child(roster_label)
	pets_label = _label(15)
	box.add_child(pets_label)
	notice_label = _label(15)
	notice_label.add_theme_color_override("font_color", WARN)
	box.add_child(notice_label)


func _label(size: int) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", INK)
	label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func set_connecting(url: String) -> void:
	_status_key = "hud.connecting"
	_status_arg = url
	_show_status()
	_roster = {}
	roster_label.text = ""


func set_joined(assigned_name: String) -> void:
	_status_key = "hud.joined"
	_status_arg = assigned_name
	_show_status()


func set_rejected(reason: String) -> void:
	_status_key = "hud.disconnected"
	_status_arg = reason
	_show_status()
	_roster = {}
	roster_label.text = ""


func _show_status() -> void:
	if _status_key == "":
		return
	var warns := _status_key == "hud.disconnected"
	status_label.add_theme_color_override("font_color", WARN if warns else INK)
	match _status_key:
		"hud.connecting":
			status_label.text = I18n.t(_status_key, {"url": _status_arg})
		"hud.joined":
			status_label.text = I18n.t(_status_key, {"name": _status_arg})
		"hud.disconnected":
			status_label.text = I18n.t(_status_key, {"reason": _status_arg})


func set_roster(roster: Dictionary, local_body: int) -> void:
	_roster = roster
	_local_body = local_body
	_show_roster()


func _show_roster() -> void:
	if _roster.is_empty():
		roster_label.text = ""
		return
	var names: Array[String] = []
	for body_id: int in _roster:
		var entry: String = _roster[body_id]
		names.append(I18n.t("hud.roster_you", {"name": entry}) if body_id == _local_body else entry)
	names.sort()
	roster_label.text = I18n.t("hud.roster", {"count": names.size(), "names": ", ".join(names)})


func set_pets(count: int, total: int = -1) -> void:
	_pets = count
	_pets_total = total
	_pets_shown = true
	_show_pets()


func _show_pets() -> void:
	if not _pets_shown:
		return
	pets_label.text = I18n.t("hud.pets", {"count": _pets})
	if _pets_total >= 0 and _pets_total != _pets:
		pets_label.text += " (%d)" % _pets_total


func retranslate() -> void:
	_show_status()
	_show_roster()
	_show_pets()


func show_notice(text: String) -> void:
	notice_label.text = text
	_notice_left = NOTICE_SECONDS


func _process(delta: float) -> void:
	if _notice_left <= 0.0:
		return
	_notice_left -= delta
	if _notice_left <= 0.0:
		notice_label.text = ""


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		leave_requested.emit()
		get_viewport().set_input_as_handled()
