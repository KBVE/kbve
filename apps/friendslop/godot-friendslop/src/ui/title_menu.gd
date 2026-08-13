class_name TitleMenu
extends CanvasLayer

## The title screen's buttons, over whatever the scene renders behind them.
##
## Built in code rather than authored as a .tscn for the same reason the pause
## menu is: the paper-and-ink look lives in MenuStyle, and a scene file would be
## a second copy of it that drifts. PaperButton is the same button the book
## pages use.
##
## Entering the world is a signal, not a `change_scene_to_file` call, so the
## flow is testable without loading the world — and so whatever comes after
## guest mode (a lobby, a server browser) can intercept it without editing this
## file.

signal play_requested
signal solo_requested
signal settings_requested
signal quit_requested
## Escape. Separate from `quit_requested` because escape means "back out of
## whatever is open", and only means "quit" when nothing is.
signal cancel_requested
## The chosen locale code. A signal like the rest: the menu does not know that
## switching language means reloading the scene, and should not.
signal locale_requested(code: String)

const WORLD_SCENE := "res://scenes/main.tscn"
const ONLINE_SCENE := "res://scenes/online.tscn"

const TITLE_KEY := "title.name"
## Shown under the button column while Supabase login is unwired, so the greyed
## button reads as "not yet" rather than "broken".
const SIGN_IN_HINT_KEY := "title.sign_in_hint"

var play_button: PaperButton
var solo_button: PaperButton
var sign_in_button: PaperButton
var settings_button: PaperButton
var quit_button: PaperButton
var status_label: Label
var language_buttons: Array[PaperButton] = []

var _root: Control


func _ready() -> void:
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	MenuStyle.detect()
	# The row names every language in its own script, so it is the one control
	# that needs all of them drawable at once. Asked for before the row is built,
	# because a button measures itself against the font it is built with.
	I18n.use_all_fonts()
	_build()
	_refresh_status()
	# Looked up rather than referenced: the suite instantiates this node on its
	# own, where the autoload is present but nothing has signed in yet.
	var auth := get_node_or_null(^"/root/Auth")
	if auth:
		auth.changed.connect(_refresh_status)


func _build() -> void:
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)

	# A vignette rather than a flat dim: the world behind is the point, and a
	# uniform scrim over it just makes the shot look muddy.
	var scrim := ColorRect.new()
	scrim.color = Color(0.05, 0.04, 0.03, 0.35)
	scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(scrim)

	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 12)
	column.anchor_left = 0.5
	column.anchor_right = 0.5
	column.anchor_top = 0.5
	column.anchor_bottom = 0.5
	column.grow_horizontal = Control.GROW_DIRECTION_BOTH
	column.grow_vertical = Control.GROW_DIRECTION_BOTH
	_root.add_child(column)

	var title := Label.new()
	title.text = I18n.t(TITLE_KEY)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 64)
	title.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	# The world behind is bright in daylight and near-black at night, so the
	# title needs its own contrast rather than borrowing the sky's.
	title.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.85))
	title.add_theme_constant_override("shadow_offset_x", 2)
	title.add_theme_constant_override("shadow_offset_y", 3)
	column.add_child(title)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 24)
	column.add_child(spacer)

	play_button = _add_button(column, I18n.t("title.play_guest"), func() -> void: play_requested.emit())
	solo_button = _add_button(column, I18n.t("title.singleplayer"), func() -> void: solo_requested.emit())
	sign_in_button = _add_button(column, I18n.t("title.sign_in"), Callable())
	# Disabled rather than hidden: the slot is real and the ecosystem it plugs
	# into exists, so hiding it would misrepresent what is left to do.
	sign_in_button.disabled = true
	sign_in_button.tooltip_text = I18n.t(SIGN_IN_HINT_KEY)
	settings_button = _add_button(column, I18n.t("action.settings"), func() -> void: settings_requested.emit())
	quit_button = _add_button(column, I18n.t("action.quit"), func() -> void: quit_requested.emit())

	status_label = Label.new()
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.add_theme_font_size_override("font_size", 14)
	status_label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	# Same reason as the title: this sits directly on lit grass, which is the
	# one background pale text disappears into.
	status_label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	status_label.add_theme_constant_override("shadow_offset_x", 1)
	status_label.add_theme_constant_override("shadow_offset_y", 1)
	column.add_child(status_label)

	_build_languages(column)


## On the title itself rather than behind Settings. A player who cannot read the
## menu cannot find the menu item that fixes that, and every other route to it
## is written in a language they have already told us they do not read.
##
## Each language is written in its own script and nothing else -- no flags (a
## flag is a country, and Spanish is not Spain), no "Spanish (ES)" gloss in a
## language the reader may not have.
func _build_languages(column: VBoxContainer) -> void:
	var locales := I18n.locales()
	if locales.size() < 2:
		return

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 18)
	column.add_child(spacer)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 6)
	column.add_child(row)

	var current := I18n.locale_code()
	for entry: Dictionary in locales:
		var code: String = entry["code"]
		var button := PaperButton.make(str(entry["name"]),
				func() -> void: locale_requested.emit(code))
		button.add_theme_font_size_override("font_size", MenuStyle.BUTTON_FONT - 4)
		# Sized to the word rather than to the column: five of these sit side by
		# side, and the button column's width would run them off a phone.
		button.custom_minimum_size = Vector2(0, MenuStyle.BUTTON_MIN.y * 0.7)
		# The current language is shown pressed rather than hidden or disabled:
		# the row is also the only place that says which language is on.
		button.disabled = code == current
		row.add_child(button)
		language_buttons.append(button)


func _add_button(parent: Control, text: String, action: Callable) -> PaperButton:
	var button := PaperButton.make(text, action)
	button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	button.custom_minimum_size = Vector2(MenuStyle.BUTTON_MIN.x * 1.2, MenuStyle.BUTTON_MIN.y)
	parent.add_child(button)
	return button


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		cancel_requested.emit()
		get_viewport().set_input_as_handled()


func _refresh_status() -> void:
	if status_label == null:
		return
	var auth := get_node_or_null(^"/root/Auth")
	if auth and auth.is_guest():
		status_label.text = I18n.t("title.guest_status")
	else:
		status_label.text = I18n.t(SIGN_IN_HINT_KEY)
