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

## Quality tiers live in graphics_settings.gd so the pre-ready latch here and the
## runtime setters there can never drift apart. The fields read these as exports
## during their own _ready, so the tier has to land in _enter_tree, which runs
## before any child readies.
const GFX := preload("res://src/settings/graphics_settings.gd")


func _enter_tree() -> void:
	GFX.apply_fields(self, GFX.saved_tier())
	# Benchmark override, e.g. Q_GRASS="blades_per_sqm=150,blade_range=30".
	# Applied after the tier so a sweep still overrides it, and before the field
	# readies so it lands at all.
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


## On-device bisect. Each step hides more of the world so the cost can be
## attributed by tapping rather than by reinstalling a build per experiment.
const BISECT_FIELDS := ["GrassField", "FloraField", "ShrubField", "StoneField", "TreeField"]
const BISECT_GROUND := ["Ground", "Terrain"]
## Water and the riverbed are QTerrain's own children, built in Rust, so they
## ride along with any step that hides Terrain. They get their own steps because
## a transparent screen-reading surface is the one thing here whose cost tracks
## neither render scale nor triangle count.
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
	bisect_step = (bisect_step + 1) % BISECT_STEPS.size()
	var step: Dictionary = BISECT_STEPS[bisect_step]
	# Every node any step can touch, so a step always restores what it does not
	# hide rather than leaving stale state from the previous step.
	for entry in BISECT_FIELDS + BISECT_GROUND + BISECT_WATER:
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
	else:
		# GraphicsSettings applies scale and PostFX visibility for the active tier
		# on its deferred first apply; setting them here too would just be a value
		# that gets overwritten a frame later.
		if OS.has_feature("mobile"):
			var ravens := get_node_or_null(^"Ravens")
			if ravens:
				ravens.set("visible", false)

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
