extends CanvasLayer

const UPDATE_INTERVAL := 0.25

@export var player_path: NodePath

var _label: Label
var _accum := 0.0
var _player: Node3D
var _grass: Node
var _trees: Node
var _detailed := true
var _worst_ms := 0.0
var _peak_ms := 0.0
var _peak_age := 0.0


func _ready() -> void:
	layer = 110
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = OS.is_debug_build()
	_player = get_node_or_null(player_path) as Node3D
	_grass = get_parent().get_node_or_null("GrassField") if get_parent() else null
	_trees = get_parent().get_node_or_null("TreeField") if get_parent() else null
	_detailed = not OS.has_feature("mobile")
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	panel.position = Vector2(8.0, -8.0)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.0, 0.0, 0.0, 0.55)
	style.set_corner_radius_all(4)
	style.set_content_margin_all(8.0)
	panel.add_theme_stylebox_override("panel", style)
	_label = Label.new()
	_label.add_theme_font_size_override("font_size", 13)
	_label.add_theme_color_override("font_color", Color(0.75, 1.0, 0.6))
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(_label)
	add_child(panel)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("debug_hud"):
		visible = not visible


func _process(delta: float) -> void:
	if not visible:
		return
	var this_ms := delta * 1000.0
	_worst_ms = maxf(_worst_ms, this_ms)
	_peak_age += delta
	if this_ms >= _peak_ms or _peak_age > 10.0:
		_peak_ms = this_ms
		_peak_age = 0.0
	_accum += delta
	if _accum < UPDATE_INTERVAL:
		return
	_accum = 0.0
	var fps := Engine.get_frames_per_second()
	var frame_ms := 1000.0 / maxf(fps, 1.0)
	var tris := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var draws := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var objects := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
	var vram := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED)
	var mem := OS.get_static_memory_usage()
	var lines := PackedStringArray()
	var proc_ms := Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	var phys_ms := Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
	lines.append("FPS %d  (%.2f ms)" % [fps, frame_ms])
	lines.append("proc %.2f  phys %.2f" % [proc_ms, phys_ms])
	var mode := ""
	var main := get_parent()
	if main and main.has_method("bisect_name"):
		mode = "  [%s]" % main.bisect_name()
	lines.append("Worst %.1f ms  Peak10s %.1f ms%s" % [_worst_ms, _peak_ms, mode])
	_worst_ms = 0.0
	var grass_line := ""
	if _detailed and _grass and _grass.has_method("get_grass_stats"):
		var s: Dictionary = _grass.get_grass_stats()
		if s.get("active", false):
			tris = maxi(tris - s.get("cap_tris", 0), 0) + s.get("tris", 0)
			grass_line = "Grass GPU %s inst  %s tris" % [_fmt_count(s.get("instances", 0)), _fmt_count(s.get("tris", 0))]
			var u: Array = s.get("utils", [])
			if u.size() >= 4:
				grass_line += "\nCaps N%d%% F%d%% C%d%% T%d%%" % [u[0], u[1], u[2], u[3]]
	lines.append("Tris %s  Draws %d  Objects %d" % [_fmt_count(tris), draws, objects])
	if grass_line != "":
		lines.append(grass_line)
	if _detailed and _trees and _trees.has_method("get_tree_stats"):
		var t: Dictionary = _trees.get_tree_stats()
		if t.get("active", false):
			lines.append("Trees N%d/%s tris  F%d/%s tris" % [
				t.get("near", 0), _fmt_count(t.get("near_tris", 0)),
				t.get("far", 0), _fmt_count(t.get("far_tris", 0)),
			])
	lines.append("VRAM %.1f MB  Mem %.1f MB" % [vram / 1048576.0, mem / 1048576.0])
	if _player == null:
		_player = _late_player()
	if _player:
		var p := _player.global_position
		lines.append("Pos %.1f, %.1f, %.1f" % [p.x, p.y, p.z])
		var vel: Vector3 = _player.velocity if _player is CharacterBody3D else Vector3.ZERO
		lines.append("Speed %.1f m/s" % vel.length())
	lines.append("Nodes %d  Orphans %d" % [get_tree().get_node_count(), Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)])
	_label.text = "\n".join(lines)


## Online there is no Player node in the scene: the body this client drives is
## spawned by the net client once the host has accepted the join.
func _late_player() -> Node3D:
	for client in get_tree().get_nodes_in_group(&"net_game_client"):
		if client.has_method(&"local_avatar"):
			return client.local_avatar() as Node3D
	return null


func _fmt_count(n: int) -> String:
	if n >= 1000000:
		return "%.2fM" % (n / 1000000.0)
	if n >= 1000:
		return "%.1fK" % (n / 1000.0)
	return str(n)
