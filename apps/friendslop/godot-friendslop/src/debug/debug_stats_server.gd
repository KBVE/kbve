extends Node

## Serves the debug HUD's numbers as JSON over loopback so a profiling pass can read
## them directly instead of going through a screenshot of the overlay.

const WINDOW := 2.0

var _server: TCPServer
var _port := 0

var _samples: PackedFloat32Array = PackedFloat32Array()
var _window_age := 0.0

var _grass: Node
var _trees: Node
var _day: Node
var _player: Node3D


func _ready() -> void:
	var port_env := OS.get_environment("Q_STATS_PORT")
	if port_env == "":
		set_process(false)
		return
	_port = int(port_env)
	if _port <= 0:
		set_process(false)
		return
	_server = TCPServer.new()
	var err := _server.listen(_port, "127.0.0.1")
	if err != OK:
		push_warning("[stats] listen on %d failed: %d" % [_port, err])
		set_process(false)
		return
	var main := get_parent()
	if main:
		_grass = main.get_node_or_null("GrassField")
		_trees = main.get_node_or_null("TreeField")
		_day = main.get_node_or_null("DayNight")
		_player = main.get_node_or_null("Player") as Node3D
	print("[stats] http://127.0.0.1:%d" % _port)


func _process(delta: float) -> void:
	_samples.append(delta * 1000.0)
	_window_age += delta
	if _window_age > WINDOW:
		_window_age = 0.0
		if _samples.size() > 1:
			_samples = _samples.slice(_samples.size() / 2)

	if _server == null or not _server.is_connection_available():
		return
	var peer := _server.take_connection()
	if peer == null:
		return
	if peer.get_available_bytes() > 0:
		peer.get_data(peer.get_available_bytes())
	var body := JSON.stringify(_snapshot(), "  ")
	var head := "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n" \
			+ "Content-Length: %d\r\nConnection: close\r\n\r\n" % body.to_utf8_buffer().size()
	peer.put_data((head + body).to_utf8_buffer())
	peer.disconnect_from_host()


func _snapshot() -> Dictionary:
	var out := {}
	out["fps"] = Engine.get_frames_per_second()
	out["frame_ms"] = _frame_stats()
	out["proc_ms"] = Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	out["phys_ms"] = Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0

	var tris := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	out["draws"] = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	out["objects"] = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
	out["vram_mb"] = float(RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED)) / 1048576.0
	out["mem_mb"] = float(OS.get_static_memory_usage()) / 1048576.0

	if _grass and _grass.has_method("get_grass_stats"):
		var g: Dictionary = _grass.get_grass_stats()
		if g.get("active", false):
			tris = maxi(tris - int(g.get("cap_tris", 0)), 0) + int(g.get("tris", 0))
			out["grass"] = {
				"instances": g.get("instances", 0),
				"tris": g.get("tris", 0),
				"caps_pct": g.get("utils", []),
			}
	if _trees and _trees.has_method("get_tree_stats"):
		out["trees"] = _trees.get_tree_stats()
	out["tris"] = tris

	out["hidden"] = OS.get_environment("Q_HIDE")
	var vp := get_viewport()
	var scale: float = vp.scaling_3d_scale
	var win := DisplayServer.window_get_size()
	out["render_scale"] = scale
	out["window_px"] = [win.x, win.y]
	out["render_px"] = [int(float(win.x) * scale), int(float(win.y) * scale)]
	out["render_mpx"] = snappedf(float(win.x) * scale * float(win.y) * scale / 1048576.0, 0.01)
	out["fullscreen"] = DisplayServer.window_get_mode() >= DisplayServer.WINDOW_MODE_FULLSCREEN
	if _day:
		out["hour"] = _day.get("hour")
		var sun := _day.get_node_or_null("Sun") as DirectionalLight3D
		if sun:
			out["sun_shadow"] = sun.shadow_enabled
			out["sun_energy"] = sun.light_energy
	if _player:
		var p := _player.global_position
		out["player"] = [snappedf(p.x, 0.1), snappedf(p.y, 0.1), snappedf(p.z, 0.1)]
	var main := get_parent()
	if main and main.has_method("bisect_name"):
		out["bisect"] = main.bisect_name()
	return out


func _frame_stats() -> Dictionary:
	if _samples.is_empty():
		return {}
	var lo := _samples[0]
	var hi := _samples[0]
	var total := 0.0
	for s in _samples:
		lo = minf(lo, s)
		hi = maxf(hi, s)
		total += s
	return {
		"min": snappedf(lo, 0.01),
		"avg": snappedf(total / float(_samples.size()), 0.01),
		"max": snappedf(hi, 0.01),
		"samples": _samples.size(),
	}
