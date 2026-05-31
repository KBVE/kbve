extends Node2D

const GAME_SCENE := "res://scenes/game.tscn"
const ENV_EMAIL := "ND_SUPABASE_EMAIL"
const ENV_PASSWORD := "ND_SUPABASE_PASSWORD"
const ENV_USERNAME := "ND_SUPABASE_USERNAME"
const ENV_OAUTH_PROVIDER := "ND_OAUTH_PROVIDER"
const DEFAULT_OAUTH_PROVIDER := "github"

var _menu: Control = null
var _sign_in_in_flight: bool = false

func _ready() -> void:
	print("[nexus-defense] menu scene ready")
	_menu = Ui.open("main_menu")
	if _menu == null:
		push_error("main_menu component failed to mount")
		return
	_menu.play_pressed.connect(_on_play)
	_menu.sign_in_pressed.connect(_on_sign_in)
	_menu.settings_pressed.connect(_on_settings)
	_menu.quit_pressed.connect(_on_quit)
	_refresh_session_chip()

func _refresh_session_chip() -> void:
	if _menu == null:
		return
	if Supabase.has_cached_session():
		_menu.set_signed_in(Supabase.cached_username())
	else:
		_menu.set_signed_out()

func _on_play() -> void:
	Ui.close("main_menu")
	get_tree().change_scene_to_file(GAME_SCENE)

func _on_sign_in() -> void:
	if _sign_in_in_flight:
		return
	if Supabase.has_cached_session():
		Supabase.clear_session()
		_refresh_session_chip()
		_menu.set_status("Session cleared — sign in again to refresh.", "info")
		return
	var email: String = OS.get_environment(ENV_EMAIL)
	var password: String = OS.get_environment(ENV_PASSWORD)
	_sign_in_in_flight = true
	_menu.set_busy(true)
	Supabase.session_ready.connect(_on_supabase_ready, CONNECT_ONE_SHOT)
	Supabase.session_failed.connect(_on_supabase_failed, CONNECT_ONE_SHOT)
	if not email.is_empty() and not password.is_empty():
		_menu.set_status("Signing in to supabase.kbve.com…", "info")
		Supabase.resume_or_sign_in(email, password, OS.get_environment(ENV_USERNAME))
		return
	# No env-baked password? Fall through to the localhost-redirect OAuth dance
	# (mirrors apps/kbve/isometric/src-tauri/src/auth.rs and the rareicon Unity
	# title screen). The browser handles the provider handshake and bounces the
	# token back to a TCPServer the supabase_client autoload is running.
	var provider: String = OS.get_environment(ENV_OAUTH_PROVIDER)
	if provider.is_empty():
		provider = DEFAULT_OAUTH_PROVIDER
	_menu.set_status("Opening browser for %s sign-in…" % provider, "info")
	Supabase.sign_in_with_oauth(provider, OS.get_environment(ENV_USERNAME))

func _on_supabase_ready(_token: String, username: String) -> void:
	_sign_in_in_flight = false
	if _menu == null:
		return
	_menu.set_busy(false)
	var display: String = username if not username.is_empty() else "guest"
	_menu.set_signed_in(display)
	_menu.set_status("Signed in as %s." % display, "ok")

func _on_supabase_failed(reason: String) -> void:
	_sign_in_in_flight = false
	if _menu == null:
		return
	_menu.set_busy(false)
	_menu.set_status("Sign-in failed: %s" % reason, "danger")
	Ui.toast("Sign-in failed: %s" % reason, 2.4, "danger")

func _on_settings() -> void:
	Ui.toast("Settings panel — TODO", 1.6, "info")

func _on_quit() -> void:
	get_tree().quit()
