class_name SignInPanel
extends Control

## Which account to sign in with, over the title's world.
##
## No password field: GoTrue has hCaptcha enabled, so the password grant refuses
## any client that has no browser to solve one in. Signing in happens in the
## player's own browser and comes back to a loopback socket, which means this
## panel collects a provider name and nothing else — there is no credential here
## to mishandle.
##
## Deliberately dumb: it reports which button was pressed and shows whatever it
## is told afterwards. It never touches `Auth`, so the flow is testable without
## a browser and the panel is testable without an account.

signal submitted(provider: String)
signal cancelled

const WIDTH := 320.0

## Provider id to how it is written on the button. The ids are GoTrue's.
const PROVIDER_NAMES := {
	"discord": "Discord",
	"github": "GitHub",
}

var provider_buttons: Dictionary[String, PaperButton] = {}
var cancel_button: PaperButton
var message_label: Label

var _busy := false


func _ready() -> void:
	# Offsets as well as anchors: a Control added in code starts at zero size,
	# and anchors alone leave it that way until something else lays it out.
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_build()


func _build() -> void:
	var scrim := ColorRect.new()
	scrim.color = Color(0.05, 0.04, 0.03, 0.55)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# Eats clicks meant for the buttons behind it — a menu you can press through
	# is a menu that starts a session while you are signing in.
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
		var label := I18n.t("title.sign_in_with").format({
			"provider": PROVIDER_NAMES.get(provider, provider.capitalize()),
		})
		var button := PaperButton.make(label, _submitter(provider))
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


## Bound per provider rather than read back off the pressed button, so the
## button's label can be translated without changing what it means.
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


## Locks the buttons while a browser round trip is in flight: a second press
## would open a second tab against a verifier the first one already owns.
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
