extends CanvasLayer

const UPDATE_INTERVAL := 0.25

@export var player_path: NodePath

var _label: Label
var _accum := 0.0
var _player: Node3D
var _grass: Node


func _ready() -> void:
	layer = 110
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = OS.is_debug_build()
	_player = get_node_or_null(player_path) as Node3D
	_grass = get_parent().get_node_or_null("GrassField") if get_parent() else null
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
	lines.append("FPS %d  (%.2f ms)" % [fps, frame_ms])
	var grass_line := ""
	if _grass and _grass.has_method("get_grass_stats"):
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
	lines.append("VRAM %.1f MB  Mem %.1f MB" % [vram / 1048576.0, mem / 1048576.0])
	if _player:
		var p := _player.global_position
		lines.append("Pos %.1f, %.1f, %.1f" % [p.x, p.y, p.z])
		var vel: Vector3 = _player.velocity if _player is CharacterBody3D else Vector3.ZERO
		lines.append("Speed %.1f m/s" % vel.length())
	lines.append("Nodes %d  Orphans %d" % [get_tree().get_node_count(), Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)])
	_label.text = "\n".join(lines)


func _fmt_count(n: int) -> String:
	if n >= 1000000:
		return "%.2fM" % (n / 1000000.0)
	if n >= 1000:
		return "%.1fK" % (n / 1000.0)
	return str(n)
