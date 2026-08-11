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
## Fullscreen CanvasLayer passes ignore scaling_3d and run at native resolution,
## so they cost the same no matter how low the 3D render scale goes.
const MOBILE_HIDE := ["PostFX", "Ravens"]


func _enter_tree() -> void:
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

	for key in OS.get_environment("Q_HIDE").split(",", false):
		var target: String = HIDE_TARGETS.get(key.strip_edges(), "")
		if target.is_empty():
			continue
		var node := get_node_or_null(NodePath(target))
		if node:
			node.set("visible", false)
