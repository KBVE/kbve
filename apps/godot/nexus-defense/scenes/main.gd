extends Node2D

const SERVER_URL := "ws://127.0.0.1:7878/ws"
# When the OS env vars below are unset, we fall back to dev-accept mode:
# the server admits any non-empty username when SUPABASE_JWT_SECRET is also
# unset. Setting them runs a real GoTrue sign-in against supabase.kbve.com.
const DEV_JWT := "dev"
const DEV_USERNAME := "h0lybyte"
const ENV_EMAIL := "ND_SUPABASE_EMAIL"
const ENV_PASSWORD := "ND_SUPABASE_PASSWORD"
const ENV_USERNAME := "ND_SUPABASE_USERNAME"

var _wave: int = 1
var _lives: int = 20
var _gold: int = 150
var _enemies: int = 12

var socket: Node = null

func _ready() -> void:
	var msg: String = "pong"
	if ClassDB.class_exists("NdPing"):
		var ping: Object = ClassDB.instantiate("NdPing")
		if ping and ping.has_method("pong"):
			msg = String(ping.call("pong"))
		if ping and ping.has_method("queue_free"):
			ping.call("queue_free")
	print("[nexus-defense] main scene ready — q::nexus_defense pong: %s" % msg)

	Ui.open("boot", {"title": "Nexus Defense", "subtitle": "Authenticating…"})

	if not ClassDB.class_exists("MatchSocket"):
		_log("MatchSocket class unavailable — running offline")
	else:
		socket = ClassDB.instantiate("MatchSocket")
		add_child(socket)
		socket.connect("connected", _on_connected)
		socket.connect("welcome", _on_welcome)
		socket.connect("snapshot", _on_snapshot)
		socket.connect("disconnected", _on_disconnected)
		socket.connect("decode_error", _on_decode_error)
		await _begin_session()

	await get_tree().create_timer(0.6).timeout
	Ui.close("boot")

	Ui.open("hud_top", {"wave": _wave, "lives": _lives, "gold": _gold, "enemies": _enemies})
	var build_bar: Control = Ui.open("build_bar", {"gold": _gold})
	if build_bar:
		build_bar.tower_selected.connect(_on_tower_selected)
		build_bar.tower_canceled.connect(_on_tower_canceled)

	Ui.open("wave_banner", {"title": "Wave %d" % _wave, "subtitle": "%d enemies inbound" % _enemies})
	Ui.toast("Godot %s · gecs + q · %s" % [Engine.get_version_info()["string"], msg], 3.0, "info")

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		Ui.toggle("pause")
	elif event.is_action_pressed("skip_wave"):
		_advance_wave()

func _advance_wave() -> void:
	_wave += 1
	_enemies = 10 + _wave * 3
	_gold += 50
	Ui.open("hud_top", {"wave": _wave, "lives": _lives, "gold": _gold, "enemies": _enemies})
	var bar := Ui.get_panel("build_bar")
	if bar:
		bar.apply({"gold": _gold})
	Ui.open("wave_banner", {"title": "Wave %d" % _wave, "subtitle": "%d enemies inbound" % _enemies})
	Ui.toast("+50 gold reward", 1.6, "ok")

func _on_tower_selected(id: String) -> void:
	Ui.toast("Selected tower: %s" % id, 1.2, "info")

func _on_tower_canceled() -> void:
	Ui.toast("Build canceled", 1.0, "warn")

func _on_connected() -> void:
	_log("ws connected")
	Ui.toast("Connected to server", 1.6, "ok")

func _on_welcome(slot: int, seed: int) -> void:
	_log("welcome: slot=%d seed=0x%x" % [slot, seed])
	Ui.toast("Welcome — slot %d" % slot, 2.0, "info")

var _last_snapshot_log_tick: int = -1

func _on_snapshot(tick: int, wave: int, enemy_count: int, gold: int, lives: int) -> void:
	# Throttle log spam — only print once per second (10 snapshots) and on wave change.
	var wave_changed: bool = wave != _wave
	if wave_changed:
		_wave = wave
		Ui.open("wave_banner", {"title": "Wave %d" % wave, "subtitle": "%d enemies inbound" % enemy_count})
	_lives = lives
	_gold = gold
	_enemies = enemy_count
	Ui.open("hud_top", {"wave": _wave, "lives": _lives, "gold": _gold, "enemies": _enemies})
	if _last_snapshot_log_tick < 0 or tick - _last_snapshot_log_tick >= 10 or wave_changed:
		_last_snapshot_log_tick = tick
		_log("snapshot tick=%d wave=%d enemies=%d gold=%d lives=%d" % [tick, wave, enemy_count, gold, lives])

func _on_disconnected(reason: String) -> void:
	_log("disconnected: %s" % reason)
	Ui.toast("Disconnected: %s" % reason, 2.4, "danger")

func _on_decode_error(detail: String) -> void:
	_log("decode error: %s" % detail)
	Ui.toast("Decode error: %s" % detail, 2.4, "warn")

func _log(line: String) -> void:
	print("[nexus-defense] %s" % line)

func _begin_session() -> void:
	var email: String = OS.get_environment(ENV_EMAIL)
	var password: String = OS.get_environment(ENV_PASSWORD)
	var hint: String = OS.get_environment(ENV_USERNAME)
	if email.is_empty() or password.is_empty():
		_log("no %s/%s set — using dev-accept JWT" % [ENV_EMAIL, ENV_PASSWORD])
		_dial(DEV_JWT, DEV_USERNAME)
		return
	_log("signing in to %s as %s" % [Supabase.SUPABASE_URL, email])
	Supabase.sign_in_succeeded.connect(_on_supabase_signed_in, CONNECT_ONE_SHOT)
	Supabase.sign_in_failed.connect(_on_supabase_failed, CONNECT_ONE_SHOT)
	Supabase.sign_in_with_password(email, password, hint)

func _on_supabase_signed_in(access_token: String, kbve_username: String) -> void:
	var resolved: String = kbve_username
	if resolved.is_empty():
		resolved = OS.get_environment(ENV_USERNAME)
	if resolved.is_empty():
		resolved = "guest"
	_log("supabase sign-in ok — kbve_username=%s" % resolved)
	_dial(access_token, resolved)

func _on_supabase_failed(reason: String) -> void:
	_log("supabase sign-in failed: %s — falling back to dev JWT" % reason)
	Ui.toast("Supabase sign-in failed: %s" % reason, 3.0, "warn")
	_dial(DEV_JWT, DEV_USERNAME)

func _dial(jwt: String, kbve_username: String) -> void:
	_log("dialing %s as %s" % [SERVER_URL, kbve_username])
	socket.call("connect_to", SERVER_URL, jwt, kbve_username)
