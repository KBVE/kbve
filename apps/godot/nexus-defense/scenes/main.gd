extends Node2D

const SERVER_URL := "ws://127.0.0.1:7878/ws"

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

	Ui.open("boot", {"title": "Nexus Defense", "subtitle": "Dialing %s…" % SERVER_URL})

	if ClassDB.class_exists("MatchSocket"):
		socket = ClassDB.instantiate("MatchSocket")
		add_child(socket)
		socket.connect("connected", _on_connected)
		socket.connect("welcome", _on_welcome)
		socket.connect("snapshot", _on_snapshot)
		socket.connect("disconnected", _on_disconnected)
		socket.connect("decode_error", _on_decode_error)
		_log("dialing %s" % SERVER_URL)
		socket.call("connect_to", SERVER_URL)
	else:
		_log("MatchSocket class unavailable — running offline")

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
