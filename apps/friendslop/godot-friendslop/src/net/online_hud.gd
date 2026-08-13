class_name OnlineHud
extends CanvasLayer

## Connection state and who else is here.

signal leave_requested

const INK := Color(0.97, 0.94, 0.85)
const WARN := Color(1.0, 0.72, 0.55)

var status_label: Label
var roster_label: Label


func _ready() -> void:
	layer = 90
	MenuStyle.detect()
	_build()


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
	status_label.add_theme_color_override("font_color", INK)
	status_label.text = I18n.t("hud.connecting", {"url": url})
	roster_label.text = ""


func set_joined(assigned_name: String) -> void:
	status_label.add_theme_color_override("font_color", INK)
	status_label.text = I18n.t("hud.joined", {"name": assigned_name})


## A rejection is terminal — the socket is gone and nothing will retry it — so it says
## why and says what to do about it, rather than leaving an empty world on screen.
func set_rejected(reason: String) -> void:
	status_label.add_theme_color_override("font_color", WARN)
	status_label.text = I18n.t("hud.disconnected", {"reason": reason})
	roster_label.text = ""


func set_roster(roster: Dictionary, local_body: int) -> void:
	if roster.is_empty():
		roster_label.text = ""
		return
	var names: Array[String] = []
	for body_id: int in roster:
		var entry: String = roster[body_id]
		names.append(I18n.t("hud.roster_you", {"name": entry}) if body_id == local_body else entry)
	names.sort()
	roster_label.text = I18n.t("hud.roster", {"count": names.size(), "names": ", ".join(names)})


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		leave_requested.emit()
		get_viewport().set_input_as_handled()
