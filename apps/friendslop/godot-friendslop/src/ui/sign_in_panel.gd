class_name SignInPanel
extends Control


signal submitted(provider: String)
signal cancelled

const WIDTH := 320.0

const PROVIDER_BRAND := {
	"discord": {
		"name": "Discord",
		"tint": Color("#5865f2"),
		"icon": "res://assets/ui/icons/discord.svg",
	},
	"github": {
		"name": "GitHub",
		"tint": Color("#24292e"),
		"icon": "res://assets/ui/icons/github.svg",
	},
	"twitch": {
		"name": "Twitch",
		"tint": Color("#9146ff"),
		"icon": "res://assets/ui/icons/twitch.svg",
	},
}

var provider_buttons: Dictionary[String, PaperButton] = {}
var cancel_button: PaperButton
var message_label: Label

var _busy := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build()
	_layout()
	get_viewport().size_changed.connect(_layout)


func _build() -> void:
	var scrim := ColorRect.new()
	scrim.color = Color(0.05, 0.04, 0.03, 0.55)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(scrim)

	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 10)
	column.anchor_left = 0.5
	column.anchor_right = 0.5
	column.anchor_top = 0.5
	column.anchor_bottom = 0.5
	column.grow_horizontal = Control.GROW_DIRECTION_BOTH
	column.grow_vertical = Control.GROW_DIRECTION_BOTH
	add_child(column)

	for provider in AuthSession.PROVIDERS:
		var brand: Dictionary = PROVIDER_BRAND.get(provider, {})
		var label := I18n.t("title.sign_in_with").format({
			"provider": brand.get("name", provider.capitalize()),
		})
		var button := PaperButton.branded(label, _submitter(provider),
				brand.get("tint", MenuStyle.PAPER_HOVER), _mark(brand.get("icon", "")))
		button.custom_minimum_size = Vector2(WIDTH, MenuStyle.BUTTON_MIN.y)
		column.add_child(button)
		provider_buttons[provider] = button

	message_label = _caption(I18n.t("title.sign_in_browser"))
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label.custom_minimum_size = Vector2(WIDTH, 0)
	message_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(message_label)

	cancel_button = PaperButton.make(I18n.t("action.cancel"), func() -> void: cancelled.emit())
	cancel_button.custom_minimum_size = Vector2(WIDTH, MenuStyle.BUTTON_MIN.y)
	column.add_child(cancel_button)


func _mark(path: String) -> Texture2D:
	if path.is_empty() or not ResourceLoader.exists(path):
		return null
	return load(path) as Texture2D


func _submitter(provider: String) -> Callable:
	return func() -> void:
		if _busy:
			return
		submitted.emit(provider)


func _caption(text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	return label


func set_busy(busy: bool) -> void:
	_busy = busy
	for button in provider_buttons.values():
		button.disabled = busy
	if busy:
		message_label.text = I18n.t("title.signing_in")


func show_message(text: String) -> void:
	set_busy(false)
	message_label.text = text


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		cancelled.emit()
		get_viewport().set_input_as_handled()


## Resizes to the viewport rather than the 1280x720 design, and re-runs whenever that
## changes so a phone rotating does not keep the old measurements. The width is capped
## against the safe area so the buttons clear a notch in landscape.
func _layout() -> void:
	if cancel_button == null:
		return
	var s := MenuStyle.ui_scale(get_viewport())
	var width := _panel_width(s)
	var height := MenuStyle.BUTTON_MIN.y * s
	for provider in provider_buttons:
		var button: PaperButton = provider_buttons[provider]
		if is_instance_valid(button):
			button.custom_minimum_size = Vector2(width, height)
			button.add_theme_font_size_override("font_size", int(MenuStyle.BUTTON_FONT * s))
	cancel_button.custom_minimum_size = Vector2(width, height)
	cancel_button.add_theme_font_size_override("font_size", int(MenuStyle.BUTTON_FONT * s))
	if message_label:
		message_label.custom_minimum_size = Vector2(width, 0)
		message_label.add_theme_font_size_override("font_size", int(14.0 * s))


func _panel_width(s: float) -> float:
	var view := get_viewport().get_visible_rect().size
	var safe := MenuStyle.safe_insets(get_viewport())
	var usable := maxf(view.x - safe.x - safe.z, 1.0)
	return minf(WIDTH * s, usable * 0.88)
