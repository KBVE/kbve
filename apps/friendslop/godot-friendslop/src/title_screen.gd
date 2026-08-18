extends Node3D


const GFX := preload("res://src/settings/graphics_settings.gd")
const PAUSE_MENU := preload("res://src/ui/pause_menu.gd")
const ONLINE_WORLD := preload("res://src/net/online_world.gd")

var _api: KbveApi

const GRASS_BOOST := 1.8
const RANGE_BOOST := 1.35

@onready var _menu: TitleMenu = $TitleMenu

var _settings: CanvasLayer


func _enter_tree() -> void:
	var tier := GFX.saved_tier()
	GFX.apply_fields(self, tier)
	_boost_grass(GFX.TIERS[tier].grass.blades_per_sqm, tier)


static func _grass_row(blades: float, tier: int) -> Dictionary:
	if tier >= 0 and tier < GFX.TIERS.size():
		return GFX.TIERS[tier].grass
	var best := 0
	for i in GFX.TIERS.size():
		var here: float = absf(GFX.TIERS[i].grass.blades_per_sqm - blades)
		if here < absf(GFX.TIERS[best].grass.blades_per_sqm - blades):
			best = i
	return GFX.TIERS[best].grass


static func boosted_grass(blades: float, tier: int, boost: float, range_boost: float) -> Dictionary:
	var row: Dictionary = _grass_row(blades, tier)
	return {
		"blades_per_sqm": clampf(blades * boost, 10.0, 600.0),
		"blade_range": row.blade_range * range_boost,
		"thin_start": row.thin_start * range_boost,
		"grass_fade_out_end": row.grass_fade_out_end * range_boost,
	}


static func boost_factors() -> Array:
	if OS.has_feature("mobile"):
		return [1.0, 1.0]
	return [GRASS_BOOST, RANGE_BOOST]


func _boost_grass(blades: float, tier: int) -> void:
	var grass := get_node_or_null(^"GrassField")
	if grass == null:
		return
	var factors := boost_factors()
	var boosted := boosted_grass(blades, tier, factors[0], factors[1])
	for key in boosted:
		grass.set(key, boosted[key])


func _on_graphics_changed() -> void:
	var gfx := get_node_or_null(^"GraphicsSettings")
	if gfx:
		_boost_grass(gfx.grass_blades, gfx.preset_index())


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var gfx := get_node_or_null(^"GraphicsSettings")
	if gfx:
		gfx.changed.connect(_on_graphics_changed)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_menu.play_requested.connect(_play)
	_menu.sign_in_requested.connect(_sign_in)
	_menu.sign_out_requested.connect(_sign_out)
	_menu.solo_requested.connect(_play_solo)
	_menu.settings_requested.connect(_open_settings)
	_menu.quit_requested.connect(_quit)
	_menu.cancel_requested.connect(_cancel)
	_menu.locale_requested.connect(_switch_locale)
	_menu.username_submitted.connect(_claim_username)
	Toast.place(Toast.Corner.TOP_RIGHT)
	_probe_server()
	_ask_language_once()
	_greet()


## Toast is an autoload and outlives this scene, so the title has to hand the corner back
## or the world keeps showing its messages up beside the compass.
func _exit_tree() -> void:
	Toast.place(Toast.Corner.BOTTOM_CENTER)


func _greet() -> void:
	await get_tree().process_frame
	var auth := get_node_or_null(^"/root/Auth")
	var name := str(auth.requested_name()) if auth else ""
	_say_hello(name, true)


static func greeting_key(name: String, returning: bool) -> String:
	if name.strip_edges() == "":
		return "title.welcome"
	return "title.welcome_back" if returning else "title.welcome_named"


func _say_hello(name: String, returning: bool) -> void:
	var key := greeting_key(name, returning)
	Toast.good(I18n.t(key, {"name": name}))


func _probe_server() -> void:
	var probe := ServerProbe.new()
	add_child(probe)
	probe.answered.connect(func(protocol: int) -> void: _menu.set_server_protocol(protocol))
	probe.unreachable.connect(func(_reason: String) -> void:
			_menu.set_server_protocol(ServerProbe.NO_ANSWER))
	probe.unreadable.connect(func(_reason: String) -> void:
			_menu.set_server_protocol(ServerProbe.UNREADABLE))
	probe.probe(ONLINE_WORLD.server_url())


func _ask_language_once() -> void:
	if I18n.has_choice() or I18n.locales().size() < 2:
		return
	var modal := LanguageModal.new()
	modal.chosen.connect(_on_language_chosen)
	add_child(modal)


func _on_language_chosen(code: String) -> void:
	if code == I18n.locale_code():
		get_tree().reload_current_scene()
		return
	_switch_locale(code)


func _switch_locale(code: String) -> void:
	if code == I18n.locale_code():
		return
	I18n.set_locale(code, true)
	get_tree().reload_current_scene()


func _play() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth and not auth.is_signed_in():
		auth.sign_in_as_guest()
	_enter(TitleMenu.ONLINE_SCENE)


func _sign_in(provider: String) -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		_menu.sign_in_failed("Sign-in is unavailable in this build.")
		return
	if await auth.sign_in_with_provider(provider) == OK:
		_menu.sign_in_succeeded()
		_say_hello(str(auth.requested_name()), false)
		_prompt_for_username_if_new(auth)
	else:
		_menu.sign_in_failed(auth.last_error())


func _sign_out() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth:
		auth.sign_out()
	_menu.close_username()


func _prompt_for_username_if_new(auth: Node) -> void:
	if auth.needs_username():
		_menu.open_username()


func _claim_username(username: String) -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		_menu.username_failed("Accounts are unavailable in this build.")
		return
	_api_client().set_username(auth.access_token(), username)


func _api_client() -> KbveApi:
	if _api == null:
		_api = KbveApi.new()
		add_child(_api)
		_api.username_set.connect(_on_username_claimed)
		_api.username_failed.connect(func(reason: String) -> void: _menu.username_failed(reason))
	return _api


func _on_username_claimed(_taken: String) -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		return
	if await auth.refresh_now() != OK:
		_menu.username_failed(auth.last_error())
		return
	_menu.close_username()
	_say_hello(str(auth.requested_name()), false)


func _play_solo() -> void:
	_enter(TitleMenu.WORLD_SCENE)


func _enter(scene: String) -> void:
	I18n.use_locale_font()
	LoadingScreen.swap(get_tree(), scene, "world" if scene == TitleMenu.WORLD_SCENE else "session")


func _open_settings() -> void:
	if _settings == null:
		_settings = CanvasLayer.new()
		_settings.set_script(PAUSE_MENU)
		_settings.toggles_on_cancel = false
		_settings.captures_mouse_on_close = false
		_settings.shows_session_actions = false
		add_child(_settings)
		await get_tree().process_frame
	_settings.open_settings()


func _cancel() -> void:
	if _menu.is_signing_in():
		_menu.close_sign_in()
		return
	if _settings and _settings.is_open():
		_settings.close()
		return
	_quit()


func _quit() -> void:
	get_tree().quit()
