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

## Mobile budget. The fields read these as exports during their own _ready, so
## the profile has to land in _enter_tree, which runs before any child readies.
## Render scale is deliberately back up: cutting it to 0.5 bought almost nothing,
## which ruled out fill as the bottleneck and left it as pure quality loss.
const MOBILE_RENDER_SCALE := 0.65
const MOBILE_GRASS := {
	"thin_start": 12.0,
	"blade_range": 22.0,
	"blades_per_sqm": 160.0,
	"billboards": false,
}
const MOBILE_FIELDS := {
	"TreeField": {"mesh_range": 55.0, "far_range": 160.0},
	"FloraField": {"fade_end": 40.0},
	"ShrubField": {"fade_end": 45.0},
}
const MOBILE_SHADOW_DISTANCE := 55.0
## Parallax is desktop-only for now. Writing DEPTH costs nothing on Forward+
## because the depth prepass already resolved visibility, but the mobile
## renderer has no prepass, so this stays off there until it is measured.
const MOBILE_GROUND := {"pom_strength": 0.0, "detail_amount": 0.35}
## Fullscreen CanvasLayer passes ignore scaling_3d and run at native resolution,
## so they cost the same no matter how low the 3D render scale goes.
const MOBILE_HIDE := ["PostFX", "Ravens"]


func _enter_tree() -> void:
	# Benchmark override, e.g. Q_GRASS="blades_per_sqm=150,blade_range=30".
	# Applied before the field readies, same as the mobile profile below.
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
	var grass := get_node_or_null("GrassField")
	if grass:
		for key in MOBILE_GRASS:
			grass.set(key, MOBILE_GRASS[key])
	for field_name in MOBILE_FIELDS:
		var field := get_node_or_null(NodePath(field_name))
		if field == null:
			continue
		for key in MOBILE_FIELDS[field_name]:
			field.set(key, MOBILE_FIELDS[field_name][key])
	var ground := get_node_or_null("Ground") as MeshInstance3D
	if ground and ground.material_override is ShaderMaterial:
		var mat: ShaderMaterial = ground.material_override
		for key in MOBILE_GROUND:
			mat.set_shader_parameter(key, MOBILE_GROUND[key])
	for light_path in ["DayNight/Sun", "DayNight/Moon"]:
		var light := get_node_or_null(light_path)
		if light:
			light.set("directional_shadow_max_distance", MOBILE_SHADOW_DISTANCE)


## On-device bisect. Each step hides more of the world so the cost can be
## attributed by tapping rather than by reinstalling a build per experiment.
const BISECT_FIELDS := ["GrassField", "FloraField", "ShrubField", "StoneField", "TreeField"]
const BISECT_GROUND := ["Ground", "Terrain"]
const BISECT_STEPS := [
	{"name": "all", "hide": []},
	{"name": "-grass", "hide": ["GrassField"]},
	{"name": "-fields", "hide": BISECT_FIELDS},
	{"name": "-terrain", "hide": BISECT_GROUND},
	{"name": "-world", "hide": BISECT_FIELDS + BISECT_GROUND},
]

var bisect_step := 0


func cycle_bisect() -> String:
	bisect_step = (bisect_step + 1) % BISECT_STEPS.size()
	var step: Dictionary = BISECT_STEPS[bisect_step]
	# Every node any step can touch, so a step always restores what it does not
	# hide rather than leaving stale state from the previous step.
	for entry in BISECT_FIELDS + BISECT_GROUND:
		var node := get_node_or_null(NodePath(entry))
		if node:
			node.set("visible", not step.hide.has(entry))
	return step.name


func bisect_name() -> String:
	return BISECT_STEPS[bisect_step].name


func _ready() -> void:
	# Benchmark override: lets a resolution sweep run without editing project
	# settings between runs, which is how fill cost gets separated from CPU cost.
	var scale_override := OS.get_environment("Q_SCALE")
	if scale_override != "":
		get_viewport().scaling_3d_scale = clampf(float(scale_override), 0.1, 2.0)
	elif OS.has_feature("mobile"):
		get_viewport().scaling_3d_scale = MOBILE_RENDER_SCALE
		for node_name in MOBILE_HIDE:
			var node := get_node_or_null(NodePath(node_name))
			if node:
				node.set("visible", false)

	# The sky is an environment background rather than a node, so it is swapped
	# for a flat colour instead of being hidden.
	var hidden := OS.get_environment("Q_HIDE").split(",", false)
	if hidden.has("sky"):
		var we := get_node_or_null("WorldEnvironment") as WorldEnvironment
		if we and we.environment:
			we.environment.background_mode = Environment.BG_COLOR
			we.environment.background_color = Color(0.4, 0.6, 0.85)
	# Fog and the colour grade are camera-relative by construction: fog falls off
	# with distance from the viewer and the grade stretches whatever gradient it
	# is handed. Both survive the pom_debug passes, which draw the ground unlit,
	# so neither can be ruled out from inside the ground shader.
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

	# Q_POM=1..5 renders a stage of the parallax pass unlit, so a flat-looking
	# ground can be traced to the height read, the tangent frame or the raymarch.
	var pom_dbg := OS.get_environment("Q_POM")
	if pom_dbg != "":
		var g := get_node_or_null("Ground") as MeshInstance3D
		if g and g.material_override is ShaderMaterial:
			(g.material_override as ShaderMaterial).set_shader_parameter("pom_debug", int(pom_dbg))

	if OS.get_environment("Q_DUMP_ROAD") != "":
		_dump_road_mask.call_deferred()

	# Q_POS="x,y,z" drops the player on a named spot, so a report about one
	# stretch of road can be reproduced without walking there again.
	var pos := OS.get_environment("Q_POS").split(",", false)
	if pos.size() == 3:
		_place_player.call_deferred(Vector3(float(pos[0]), float(pos[1]), float(pos[2])))


## Deferred, and held for a few frames: the player readies after this node and
## the terrain settles it again once the collider streams in, so a single
## assignment during _ready is overwritten before anything is drawn.
func _place_player(where: Vector3) -> void:
	var player := get_node_or_null("Player") as Node3D
	if player == null:
		return
	for i in 30:
		player.global_position = where
		await get_tree().process_frame


## Writes the baked road and clearance masks out as images so a gap in the paint
## can be told apart from a gap in the shading. The terrain builds on a worker,
## so this waits for the parameter to actually be set rather than assuming it is.
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
