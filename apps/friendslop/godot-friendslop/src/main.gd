extends Node3D

const HIDE_TARGETS := {
	"post": "PostFX",
	"ravens": "Ravens",
	"hud": "DebugHud",
	"grass": "GrassField",
	"flora": "FloraField",
	"shrub": "ShrubField",
	"trees": "TreeField",
	"stones": "StoneField",
	"terrain": "Terrain",
	"ground": "Ground",
}

const GFX := preload("res://src/settings/graphics_settings.gd")


func _enter_tree() -> void:
	GFX.apply_fields(self, GFX.saved_tier())
	var overrides := OS.get_environment("Q_GRASS")
	if overrides != "":
		var grass_node := get_node_or_null("GrassField")
		if grass_node:
			for pair in overrides.split(",", false):
				var kv := pair.split("=", false)
				if kv.size() == 2:
					grass_node.set(kv[0].strip_edges(), float(kv[1]))
	if not OS.has_feature("mobile"):
		return
	var ground := get_node_or_null("Ground") as MeshInstance3D
	if ground and ground.material_override is ShaderMaterial:
		var mat: ShaderMaterial = ground.material_override
		for key in GFX.MOBILE_GROUND:
			mat.set_shader_parameter(key, GFX.MOBILE_GROUND[key])


const BISECT_FIELDS := ["GrassField", "FloraField", "ShrubField", "StoneField", "TreeField"]
const BISECT_GROUND := ["Ground", "Terrain"]
const BISECT_WATER := ["Terrain/Water", "Terrain/Riverbed"]
const BISECT_STEPS := [
	{"name": "all", "hide": []},
	{"name": "-water", "hide": ["Terrain/Water"]},
	{"name": "-water-bed", "hide": BISECT_WATER},
	{"name": "-grass", "hide": ["GrassField"]},
	{"name": "-fields", "hide": BISECT_FIELDS},
	{"name": "-terrain", "hide": BISECT_GROUND},
	{"name": "-world", "hide": BISECT_FIELDS + BISECT_GROUND + BISECT_WATER},
]

var bisect_step := 0


func cycle_bisect() -> String:
	set_bisect((bisect_step + 1) % BISECT_STEPS.size())
	return bisect_name()


func set_bisect(index: int) -> void:
	bisect_step = clampi(index, 0, BISECT_STEPS.size() - 1)
	var step: Dictionary = BISECT_STEPS[bisect_step]
	for entry in BISECT_FIELDS + BISECT_GROUND + BISECT_WATER:
		var node := get_node_or_null(NodePath(entry))
		if node:
			node.set("visible", not step.hide.has(entry))


func bisect_names() -> Array:
	var out: Array = []
	for step in BISECT_STEPS:
		out.append(step.name)
	return out


func bisect_name() -> String:
	return BISECT_STEPS[bisect_step].name


const SAVE_DIR := "user://world"
const SAVE_FIELDS := {"TreeField": "trees.hrv", "StoneField": "stones.hrv"}
const SAVE_INTERVAL := 20.0

var _save_clock := 0.0


func _load_harvest() -> void:
	for field_name in SAVE_FIELDS:
		var field := get_node_or_null(NodePath(field_name))
		if field == null or not field.has_method("import_harvest"):
			continue
		var path: String = SAVE_DIR + "/" + str(SAVE_FIELDS[field_name])
		if not FileAccess.file_exists(path):
			continue
		var bytes := FileAccess.get_file_as_bytes(path)
		if bytes.is_empty() or not field.import_harvest(bytes):
			push_warning("[q] harvest save ignored (wrong world?): " + path)


func _save_harvest() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)
	for field_name in SAVE_FIELDS:
		var field := get_node_or_null(NodePath(field_name))
		if field == null or not field.has_method("export_harvest"):
			continue
		var file := FileAccess.open(SAVE_DIR + "/" + SAVE_FIELDS[field_name], FileAccess.WRITE)
		if file:
			file.store_buffer(field.export_harvest())
			file.close()


func _process(delta: float) -> void:
	_save_clock += delta
	if _save_clock >= SAVE_INTERVAL:
		_save_clock = 0.0
		_save_harvest()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_EXIT_TREE:
		_save_harvest()


func _ready() -> void:
	_load_harvest()
	var scale_override := OS.get_environment("Q_SCALE")
	if scale_override != "":
		get_viewport().scaling_3d_scale = clampf(float(scale_override), 0.1, 2.0)
	else:
		if OS.has_feature("mobile"):
			var ravens := get_node_or_null(^"Ravens")
			if ravens:
				ravens.set("visible", false)

	var hidden := OS.get_environment("Q_HIDE").split(",", false)
	if hidden.has("sky"):
		var we := get_node_or_null("WorldEnvironment") as WorldEnvironment
		if we and we.environment:
			we.environment.background_mode = Environment.BG_COLOR
			we.environment.background_color = Color(0.4, 0.6, 0.85)
	if hidden.has("fog") or hidden.has("adjust"):
		var we_fx := get_node_or_null("WorldEnvironment") as WorldEnvironment
		if we_fx and we_fx.environment:
			if hidden.has("fog"):
				we_fx.environment.fog_enabled = false
			if hidden.has("adjust"):
				we_fx.environment.adjustment_enabled = false
	for key in OS.get_environment("Q_HIDE").split(",", false):
		var target: String = HIDE_TARGETS.get(key.strip_edges(), "")
		if target.is_empty():
			continue
		var node := get_node_or_null(NodePath(target))
		if node:
			node.set("visible", false)

	var pom_dbg := OS.get_environment("Q_POM")
	if pom_dbg != "":
		var g := get_node_or_null("Ground") as MeshInstance3D
		if g and g.material_override is ShaderMaterial:
			(g.material_override as ShaderMaterial).set_shader_parameter("pom_debug", int(pom_dbg))

	if OS.get_environment("Q_DUMP_ROAD") != "":
		_dump_road_mask.call_deferred()

	var pos := OS.get_environment("Q_POS").split(",", false)
	if pos.size() == 3:
		_place_player.call_deferred(Vector3(float(pos[0]), float(pos[1]), float(pos[2])))


func world_ready() -> bool:
	var terrain := get_node_or_null(^"Terrain")
	if terrain == null or not terrain.has_method("is_ground_ready"):
		return true
	return terrain.is_ground_ready()


func _place_player(where: Vector3) -> void:
	var player := get_node_or_null("Player") as Node3D
	if player == null:
		return
	for i in 30:
		player.global_position = where
		await get_tree().process_frame


func _dump_road_mask() -> void:
	var ground := get_node_or_null("Ground") as MeshInstance3D
	if ground == null or not (ground.material_override is ShaderMaterial):
		return
	var mat: ShaderMaterial = ground.material_override
	for i in 60:
		await get_tree().create_timer(0.5).timeout
		var road: Texture2D = mat.get_shader_parameter("road_tex")
		if road == null:
			continue
		road.get_image().save_png("user://road_mask.png")
		var clear: Texture2D = mat.get_shader_parameter("clearance_tex")
		if clear:
			clear.get_image().save_png("user://clearance_mask.png")
		print("[q] road mask dumped ", road.get_width(), "x", road.get_height())
		get_tree().quit()
		return
	print("[q] road mask never arrived")
	get_tree().quit()
