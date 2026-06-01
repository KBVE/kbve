extends Node2D

const SERVER_URL := "ws://127.0.0.1:7878/ws"
const DEV_JWT := "dev"
const DEV_USERNAME := "h0lybyte"
const ENV_EMAIL := "ND_SUPABASE_EMAIL"
const ENV_PASSWORD := "ND_SUPABASE_PASSWORD"
const ENV_USERNAME := "ND_SUPABASE_USERNAME"

const TowerSprite := preload("res://ui/components/tower_sprite.gd")
const EnemySprite := preload("res://ui/components/enemy_sprite.gd")
const ENEMY_MARCH_DURATION := 8.0
const ENEMY_SPAWN_STAGGER := 0.35

# Tower discriminants from proto::BuildKind. Used by build_bar id →
# server kind_idx + reverse for sprite rendering.
const BUILD_KIND_TOWER := 0
const BUILD_KIND_GENERATOR := 1
const BUILD_KIND_BATTERY := 2
const BUILD_KIND_REPAIR := 3
const BUILD_KIND_ARMOURY := 4
const BUILD_KIND_VILLAGE := 5
const BUILD_KIND_TOWN := 6
const BUILD_KIND_CASTLE := 7
const BUILD_KIND_NEXUS := 8

const BUILD_KIND_TO_SPRITE_ID := {
	BUILD_KIND_TOWER: "arrow",
	BUILD_KIND_GENERATOR: "magic",
	BUILD_KIND_BATTERY: "frost",
	BUILD_KIND_REPAIR: "frost",
	BUILD_KIND_ARMOURY: "cannon",
	BUILD_KIND_VILLAGE: "arrow",
	BUILD_KIND_TOWN: "cannon",
	BUILD_KIND_CASTLE: "cannon",
	BUILD_KIND_NEXUS: "magic",
}

var _wave: int = 1
var _lives: int = 20
var _gold: int = 150
var _enemies: int = 12

var socket: Node = null
var _last_snapshot_log_tick: int = -1
var _selected_tower: String = ""
var _hex_map: Node2D = null
var _world: Node2D = null

# Snapshot-driven entity registries. Keys are server eids (int); values
# are the godot nodes rendering each. We diff incoming snapshots against
# these to spawn / despawn sprites without re-creating the whole scene.
var _enemy_sprites: Dictionary = {}
var _building_sprites: Dictionary = {}

func _ready() -> void:
	_world = get_node_or_null("World")
	_hex_map = get_node_or_null("World/HexMap")
	var msg: String = "pong"
	if ClassDB.class_exists("NdPing"):
		var ping: Object = ClassDB.instantiate("NdPing")
		if ping and ping.has_method("pong"):
			msg = String(ping.call("pong"))
		if ping and ping.has_method("queue_free"):
			ping.call("queue_free")
	print("[nexus-defense] game scene ready — q::nexus_defense pong: %s" % msg)

	Ui.open("boot", {"title": "Nexus Defense", "subtitle": "Authenticating…"})

	if not ClassDB.class_exists("MatchSocket"):
		_log("MatchSocket class unavailable — running offline")
	else:
		socket = ClassDB.instantiate("MatchSocket")
		add_child(socket)
		socket.connect("connected", _on_connected)
		socket.connect("welcome", _on_welcome)
		socket.connect("snapshot", _on_snapshot)
		socket.connect("enemies_update", _on_enemies_update)
		socket.connect("buildings_update", _on_buildings_update)
		socket.connect("disconnected", _on_disconnected)
		socket.connect("decode_error", _on_decode_error)
		await _begin_session()

	await get_tree().create_timer(0.6).timeout
	Ui.close("boot")

	Ui.open("hud_top", {"wave": _wave, "lives": _lives, "gold": _gold, "enemies": _enemies, "is_multiplayer": socket != null})
	var build_bar: Control = Ui.open("build_bar", {"gold": _gold})
	if build_bar:
		build_bar.tower_selected.connect(_on_tower_selected)
		build_bar.tower_canceled.connect(_on_tower_canceled)

	Ui.open("wave_banner", {"title": "Wave %d" % _wave, "subtitle": "%d enemies inbound" % _enemies})
	Ui.toast("Godot %s · gecs + q · %s" % [Engine.get_version_info()["string"], msg], 3.0, "info")
	# Offline / no server → keep the cosmetic enemy marchers so the
	# visual stays alive; when connected the snapshot stream drives
	# entity lifecycle instead.
	if socket == null:
		_spawn_wave_enemies(_enemies)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if socket == null:
			Ui.toggle("pause")
		else:
			Ui.toast("Pause unavailable in multiplayer", 1.4, "warn")
		return
	if event.is_action_pressed("skip_wave"):
		_advance_wave()
		return
	if event.is_action_pressed("ui_cancel"):
		if _selected_tower != "":
			_cancel_placement()
		else:
			_return_to_menu()
		return
	if _selected_tower == "" or _hex_map == null:
		return
	if event is InputEventMouseMotion:
		_update_hover(event.position)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			_try_place(event.position)
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			_cancel_placement()

func _viewport_to_world(screen_pos: Vector2) -> Vector2:
	var canvas_xform: Transform2D = _hex_map.get_canvas_transform()
	return canvas_xform.affine_inverse() * screen_pos

func _update_hover(screen_pos: Vector2) -> void:
	var world_pos: Vector2 = _viewport_to_world(screen_pos)
	var axial: Vector2i = _hex_map.pixel_to_axial(world_pos)
	if not _hex_map.contains_axial(axial):
		_hex_map.clear_hover()
		return
	var buildable: bool = _hex_map.is_axial_buildable(axial)
	_hex_map.set_hover(axial, buildable)

func _try_place(screen_pos: Vector2) -> void:
	var world_pos: Vector2 = _viewport_to_world(screen_pos)
	var axial: Vector2i = _hex_map.pixel_to_axial(world_pos)
	if not _hex_map.is_axial_buildable(axial):
		Ui.toast("Cannot build here", 1.4, "warn")
		return
	var occupied: Array[Vector2i] = (_hex_map.occupied_axials as Array[Vector2i]).duplicate()
	occupied.append(axial)
	_hex_map.set_occupied(occupied)
	_send_place_building(axial.x, axial.y, _tower_kind_idx(_selected_tower))
	# When connected the server snapshot will include the new building on
	# the next tick; offline (no socket) we render an optimistic local
	# sprite so placement still feels responsive.
	if socket == null:
		_spawn_tower_sprite(_selected_tower, axial)
	Ui.toast("Placed %s at (%d,%d)" % [_selected_tower, axial.x, axial.y], 1.6, "ok")
	_cancel_placement()

func _spawn_tower_sprite(tower_id: String, axial: Vector2i) -> void:
	if _hex_map == null:
		return
	var sprite: Node2D = TowerSprite.new()
	sprite.apply_id(tower_id)
	sprite.position = _hex_map.axial_to_pixel(axial.x, axial.y)
	_hex_map.add_child(sprite)

func _path_points() -> PackedVector2Array:
	var pts: PackedVector2Array = PackedVector2Array()
	if _hex_map == null:
		return pts
	for v in _hex_map.path_axials:
		var axial: Vector2i = v
		pts.append(_hex_map.axial_to_pixel(axial.x, axial.y))
	return pts

func _spawn_wave_enemies(count: int) -> void:
	if _hex_map == null or count <= 0:
		return
	var pts: PackedVector2Array = _path_points()
	if pts.size() < 2:
		return
	for i in count:
		var enemy: Node2D = EnemySprite.new()
		_hex_map.add_child(enemy)
		_start_enemy_after(enemy, pts, float(i) * ENEMY_SPAWN_STAGGER)

func _start_enemy_after(enemy: Node2D, pts: PackedVector2Array, delay: float) -> void:
	if delay > 0.0:
		await get_tree().create_timer(delay).timeout
	if is_instance_valid(enemy):
		enemy.call("start", pts, ENEMY_MARCH_DURATION)

func _send_place_building(col: int, row: int, kind_idx: int) -> void:
	if socket == null or not socket.call("is_ws_connected"):
		return
	socket.call("send_place_building", _last_snapshot_tick, col, row, kind_idx)
	_log("sent PlaceBuilding col=%d row=%d kind_idx=%d" % [col, row, kind_idx])

func _tower_kind_idx(tower_id: String) -> int:
	# Mirrors proto::BuildKind discriminants. Default to Tower until the
	# build_bar IDs gain explicit kind metadata.
	match tower_id:
		"basic", "bomb", "ice", "fire", "artillery", "lightning", "sniper":
			return 0  # Tower
		"solar", "diesel", "nuclear":
			return 1  # Generator
		"battery":
			return 2  # Battery
		"repair":
			return 3  # Repair
		"armoury":
			return 4  # Armoury
		"village":
			return 5  # Village
		"town":
			return 6  # Town
		"castle":
			return 7  # Castle
		_:
			return 0

func _cancel_placement() -> void:
	_selected_tower = ""
	if _hex_map:
		_hex_map.clear_hover()
	var bar: Control = Ui.get_panel("build_bar")
	if bar and bar.has_method("clear_selection"):
		bar.clear_selection()

func _advance_wave() -> void:
	_wave += 1
	_enemies = 10 + _wave * 3
	_gold += 50
	Ui.open("hud_top", {"wave": _wave, "lives": _lives, "gold": _gold, "enemies": _enemies, "kills": _last_kills})
	var bar := Ui.get_panel("build_bar")
	if bar:
		bar.apply({"gold": _gold})
	Ui.open("wave_banner", {"title": "Wave %d" % _wave, "subtitle": "%d enemies inbound" % _enemies})
	Ui.toast("+50 gold reward", 1.6, "ok")
	# skip_wave is a local debug shortcut — only spawn cosmetic
	# marchers when offline. Connected play gets enemies from the
	# server's wave system.
	if socket == null:
		_spawn_wave_enemies(_enemies)

func _return_to_menu() -> void:
	for panel_name in ["hud_top", "build_bar", "wave_banner", "pause"]:
		if Ui.is_open(panel_name):
			Ui.close(panel_name)
	get_tree().change_scene_to_file("res://scenes/main.tscn")

func _on_tower_selected(id: String) -> void:
	_selected_tower = id
	if _hex_map:
		_hex_map.clear_hover()
	Ui.toast("Click a hex to place %s" % id, 1.4, "info")

func _on_tower_canceled() -> void:
	_selected_tower = ""
	if _hex_map:
		_hex_map.clear_hover()
	Ui.toast("Build canceled", 1.0, "warn")

func _on_connected() -> void:
	_log("ws connected")
	Ui.toast("Connected to server", 1.6, "ok")

func _on_welcome(slot: int, seed: int) -> void:
	_log("welcome: slot=%d seed=0x%x" % [slot, seed])
	Ui.toast("Welcome — slot %d" % slot, 2.0, "info")
	# Smoke: when ND_AUTO_PLACE is set, fire a PlaceBuilding 0.8 s after
	# Welcome so headless runs can exercise the input pump without a real
	# click. Disabled by default for normal gameplay.
	if OS.get_environment("ND_AUTO_PLACE") != "":
		await get_tree().create_timer(0.8).timeout
		_send_place_building(0, 0, 0)

var _last_snapshot_tick: int = 0
var _last_building_count: int = 0
var _last_phase: int = -1
var _last_kills: int = 0

const PHASE_PREPARE := 0
const PHASE_WAVE := 1
const PHASE_INTERMISSION := 2
const PHASE_GAMEOVER := 3

func _phase_name(phase: int) -> String:
	match phase:
		PHASE_PREPARE: return "Prepare"
		PHASE_WAVE: return "Wave"
		PHASE_INTERMISSION: return "Intermission"
		PHASE_GAMEOVER: return "Game Over"
		_: return "Unknown"

func _on_snapshot(tick: int, wave: int, enemy_count: int, building_count: int, gold: int, lives: int, phase: int, phase_remaining_ms: int, kills: int) -> void:
	_last_snapshot_tick = tick
	var wave_changed: bool = wave != _wave
	var building_changed: bool = building_count != _last_building_count
	var phase_changed: bool = phase != _last_phase
	_last_building_count = building_count
	if wave_changed and phase == PHASE_WAVE:
		_wave = wave
		Ui.open("wave_banner", {"title": "Wave %d" % wave, "subtitle": "%d enemies inbound" % enemy_count})
	elif phase_changed and phase == PHASE_PREPARE:
		var secs := int(ceil(float(phase_remaining_ms) / 1000.0))
		Ui.open("wave_banner", {"title": "Prepare", "subtitle": "Wave %d in %ds" % [max(wave, 1), secs]})
	elif phase_changed and phase == PHASE_GAMEOVER:
		Ui.open("wave_banner", {"title": "Game Over", "subtitle": "Survived %d wave(s)" % wave})
	if kills > _last_kills:
		_last_kills = kills
	_last_phase = phase
	_wave = wave
	_lives = lives
	_gold = gold
	_enemies = enemy_count
	Ui.open("hud_top", {
		"wave": _wave,
		"lives": _lives,
		"gold": _gold,
		"enemies": _enemies,
		"kills": kills,
		"phase": phase,
		"phase_remaining_ms": phase_remaining_ms,
	})
	if _last_snapshot_log_tick < 0 or tick - _last_snapshot_log_tick >= 10 or wave_changed or building_changed or phase_changed:
		_last_snapshot_log_tick = tick
		_log("snapshot tick=%d phase=%s wave=%d enemies=%d buildings=%d gold=%d lives=%d kills=%d remaining_ms=%d" % [tick, _phase_name(phase), wave, enemy_count, building_count, gold, lives, kills, phase_remaining_ms])

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
	if email.is_empty() and password.is_empty() and not Supabase.has_cached_session():
		_log("no %s/%s set and no cached session — using dev-accept JWT" % [ENV_EMAIL, ENV_PASSWORD])
		_dial(DEV_JWT, DEV_USERNAME)
		return
	_log("supabase session bootstrap (cached -> refresh -> sign_in chain)")
	Supabase.session_ready.connect(_on_supabase_ready, CONNECT_ONE_SHOT)
	Supabase.session_failed.connect(_on_supabase_failed, CONNECT_ONE_SHOT)
	Supabase.resume_or_sign_in(email, password, hint)

func _on_supabase_ready(access_token: String, kbve_username: String) -> void:
	var resolved: String = kbve_username
	if resolved.is_empty():
		resolved = OS.get_environment(ENV_USERNAME)
	if resolved.is_empty():
		resolved = "guest"
	_log("supabase session ready — kbve_username=%s" % resolved)
	_dial(access_token, resolved)

func _on_supabase_failed(reason: String) -> void:
	_log("supabase session failed: %s — falling back to dev JWT" % reason)
	Ui.toast("Supabase auth failed: %s" % reason, 3.0, "warn")
	_dial(DEV_JWT, DEV_USERNAME)

func _dial(jwt: String, kbve_username: String) -> void:
	_log("dialing %s as %s" % [SERVER_URL, kbve_username])
	socket.call("connect_to", SERVER_URL, jwt, kbve_username)

# -----------------------------------------------------------------------------
# Snapshot-driven entity rendering
#
# The server is the source of truth for what exists on the field. Each
# snapshot carries the full per-slot roster of enemies + buildings; we
# diff against the maps below to spawn / despawn sprites.
#
# Entities are keyed by server eid (u32 → int). When an eid appears in
# the incoming list and we don't have a sprite for it yet → spawn. When
# an eid we know about is missing from the list (or has `destroyed:
# true`) → queue_free + erase. Position-only updates can be added later
# once enemies move along a path the client can interpolate.
# -----------------------------------------------------------------------------

func _on_enemies_update(entities: Array) -> void:
	if _hex_map == null:
		return
	var seen: Dictionary = {}
	for entry in entities:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var data: Dictionary = entry
		if not data.has("eid"):
			continue
		var eid: int = int(data["eid"])
		seen[eid] = true
		var destroyed: bool = bool(data.get("destroyed", false))
		if destroyed:
			_despawn_enemy(eid)
			continue
		if not _enemy_sprites.has(eid):
			_spawn_snapshot_enemy(eid)
	for eid in _enemy_sprites.keys():
		if not seen.has(eid):
			_despawn_enemy(eid)

func _spawn_snapshot_enemy(eid: int) -> void:
	var pts: PackedVector2Array = _path_points()
	if pts.size() < 2:
		return
	var sprite: Node2D = EnemySprite.new()
	_hex_map.add_child(sprite)
	sprite.call("start", pts, ENEMY_MARCH_DURATION)
	_enemy_sprites[eid] = sprite

func _despawn_enemy(eid: int) -> void:
	if not _enemy_sprites.has(eid):
		return
	var node: Variant = _enemy_sprites[eid]
	if node is Node and is_instance_valid(node):
		(node as Node).queue_free()
	_enemy_sprites.erase(eid)

func _on_buildings_update(entities: Array) -> void:
	if _hex_map == null:
		return
	var seen: Dictionary = {}
	for entry in entities:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var data: Dictionary = entry
		if not data.has("eid"):
			continue
		var eid: int = int(data["eid"])
		seen[eid] = true
		var destroyed: bool = bool(data.get("destroyed", false))
		if destroyed:
			_despawn_building(eid)
			continue
		var col: int = int(data.get("col", 0))
		var row: int = int(data.get("row", 0))
		var kind: int = int(data.get("kind", BUILD_KIND_TOWER))
		if not _building_sprites.has(eid):
			_spawn_snapshot_building(eid, kind, col, row)
	for eid in _building_sprites.keys():
		if not seen.has(eid):
			_despawn_building(eid)

func _spawn_snapshot_building(eid: int, kind: int, col: int, row: int) -> void:
	var sprite: Node2D = TowerSprite.new()
	var sprite_id: String = String(BUILD_KIND_TO_SPRITE_ID.get(kind, "arrow"))
	sprite.apply_id(sprite_id)
	sprite.position = _hex_map.axial_to_pixel(col, row)
	_hex_map.add_child(sprite)
	_building_sprites[eid] = sprite

func _despawn_building(eid: int) -> void:
	if not _building_sprites.has(eid):
		return
	var node: Variant = _building_sprites[eid]
	if node is Node and is_instance_valid(node):
		(node as Node).queue_free()
	_building_sprites.erase(eid)
