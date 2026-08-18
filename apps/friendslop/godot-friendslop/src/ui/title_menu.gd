class_name TitleMenu
extends CanvasLayer


signal play_requested
signal solo_requested
signal sign_in_requested(provider: String)
signal sign_out_requested
signal settings_requested
signal quit_requested
signal cancel_requested
signal locale_requested(code: String)
signal username_submitted(username: String)

const WORLD_SCENE := "res://scenes/main.tscn"
const ONLINE_SCENE := "res://scenes/online.tscn"

const SIGN_IN_PANEL := preload("res://src/ui/sign_in_panel.gd")
const USERNAME_PANEL := preload("res://src/ui/username_panel.gd")
const AUTH := preload("res://src/autoload/auth_session.gd")

const TITLE_KEY := "title.name"
const SIGN_IN_HINT_KEY := "title.sign_in_hint"

var play_button: PaperButton
var solo_button: PaperButton
var sign_in_button: PaperButton
var settings_button: PaperButton
var quit_button: PaperButton
var status_label: Label
var build_label: Label
var account_card: AccountCard
var language_buttons: Array[PaperButton] = []

var _root: Control
var _column: VBoxContainer
var _sign_in: SignInPanel
var _username: UsernamePanel
var _api: KbveApi


func _ready() -> void:
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS
	MenuStyle.detect()
	I18n.use_all_fonts()
	_build()
	_refresh_status()
	var auth := get_node_or_null(^"/root/Auth")
	if auth:
		auth.changed.connect(_refresh_status)


func _build() -> void:
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)

	var scrim := ColorRect.new()
	scrim.color = Color(0.05, 0.04, 0.03, 0.35)
	scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(scrim)

	var column := VBoxContainer.new()
	_column = column
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
	title.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.85))
	title.add_theme_constant_override("shadow_offset_x", 2)
	title.add_theme_constant_override("shadow_offset_y", 3)
	column.add_child(title)

	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 24)
	column.add_child(spacer)

	play_button = _add_button(column, I18n.t("title.play_guest"), func() -> void: play_requested.emit())
	solo_button = _add_button(column, I18n.t("title.singleplayer"), func() -> void: solo_requested.emit())
	sign_in_button = _add_button(column, I18n.t("title.sign_in"), _toggle_sign_in)
	settings_button = _add_button(column, I18n.t("action.settings"), func() -> void: settings_requested.emit())
	quit_button = _add_button(column, I18n.t("action.quit"), func() -> void: quit_requested.emit())

	account_card = AccountCard.new()
	account_card.visible = false
	column.add_child(account_card)

	status_label = Label.new()
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.add_theme_font_size_override("font_size", 14)
	status_label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	status_label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	status_label.add_theme_constant_override("shadow_offset_x", 1)
	status_label.add_theme_constant_override("shadow_offset_y", 1)
	column.add_child(status_label)

	build_label = Label.new()
	build_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	build_label.add_theme_font_size_override("font_size", 12)
	build_label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	build_label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	build_label.add_theme_constant_override("shadow_offset_x", 1)
	build_label.add_theme_constant_override("shadow_offset_y", 1)
	build_label.modulate.a = 0.75
	column.add_child(build_label)
	set_server_protocol(0)

	_build_languages(column)


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
		button.custom_minimum_size = Vector2(0, MenuStyle.BUTTON_MIN.y * 0.7)
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


func _toggle_sign_in() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth and auth.mode() == AUTH.Mode.ACCOUNT:
		sign_out_requested.emit()
		return
	open_sign_in()


func open_sign_in() -> void:
	if _sign_in != null:
		return
	_sign_in = SIGN_IN_PANEL.new()
	_sign_in.submitted.connect(func(provider: String) -> void:
		_sign_in.set_busy(true)
		sign_in_requested.emit(provider))
	_sign_in.cancelled.connect(close_sign_in)
	_root.add_child(_sign_in)
	_column.visible = false


func close_sign_in() -> void:
	if _sign_in == null:
		return
	_sign_in.queue_free()
	_sign_in = null
	_column.visible = true


func is_signing_in() -> bool:
	return _sign_in != null


func open_username() -> void:
	if _username != null:
		return
	close_sign_in()
	_username = USERNAME_PANEL.new()
	_username.submitted.connect(func(name: String) -> void: username_submitted.emit(name))
	_username.cancelled.connect(func() -> void: sign_out_requested.emit())
	_root.add_child(_username)
	_column.visible = false


func close_username() -> void:
	if _username == null:
		return
	_username.queue_free()
	_username = null
	_column.visible = true


func is_naming() -> bool:
	return _username != null


func username_failed(message: String) -> void:
	if _username:
		_username.show_message(message)


func sign_in_failed(message: String) -> void:
	if _sign_in:
		_sign_in.show_message(message)


func sign_in_succeeded() -> void:
	close_sign_in()
	_refresh_status()


func set_server_protocol(protocol: int) -> void:
	if build_label == null:
		return
	var mine := BuildInfo.protocol()
	var line := I18n.t("title.build").format({
		"version": BuildInfo.version(),
		"protocol": mine,
	})
	if protocol > 0:
		line += "  ·  " + I18n.t("title.server_protocol").format({"protocol": protocol})
		if protocol != mine:
			line += "  ·  " + I18n.t("title.protocol_mismatch")
	elif protocol == ServerProbe.UNREADABLE:
		line += "  ·  " + I18n.t("title.server_protocol_unknown")
	elif protocol < 0:
		line += "  ·  " + I18n.t("title.server_unreachable")
	build_label.text = line
	build_label.modulate = Color(1.0, 0.55, 0.45) if protocol > 0 and protocol != mine \
			else Color(1.0, 1.0, 1.0, 0.75)


func _show_account(auth: Node) -> void:
	if account_card == null:
		return
	account_card.show_account(auth.requested_name())
	account_card.load_avatar(auth.avatar_url())
	if _api == null:
		_api = KbveApi.new()
		add_child(_api)
		_api.wallet.connect(func(credits: int, khash: int) -> void:
			account_card.show_wallet(credits, khash))
		_api.wallet_failed.connect(func(reason: String) -> void:
			account_card.show_wallet_error(reason))
	if not auth.needs_username():
		_api.fetch_wallet(auth.access_token())


func _refresh_status() -> void:
	if status_label == null:
		return
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		status_label.text = I18n.t(SIGN_IN_HINT_KEY)
		return
	match auth.mode():
		AUTH.Mode.ACCOUNT:
			status_label.text = I18n.t("title.signed_in_as").format({"name": auth.requested_name()})
			sign_in_button.text = I18n.t("title.sign_out")
			_name_play_button(auth.requested_name())
			_show_account(auth)
		AUTH.Mode.GUEST:
			status_label.text = I18n.t("title.guest_status")
			sign_in_button.text = I18n.t("title.sign_in")
			_guest_play_button()
			account_card.visible = false
		_:
			status_label.text = I18n.t(SIGN_IN_HINT_KEY)
			sign_in_button.text = I18n.t("title.sign_in")
			_guest_play_button()
			account_card.visible = false


## Says who is about to play, because the button is the last thing read before joining and
## a stale "Play as Guest" on a signed-in account reads as the sign-in having been dropped.
##
## An account is not guaranteed to carry a username yet -- the panel that asks for one opens
## over this menu -- so a nameless account gets the plain verb rather than a dangling "as".
func _name_play_button(account: String) -> void:
	if play_button == null:
		return
	if account.is_empty():
		play_button.text = I18n.t("action.play")
		return
	play_button.text = I18n.t("title.play_as_account", {"name": account})


func _guest_play_button() -> void:
	if play_button:
		play_button.text = I18n.t("title.play_guest")
