extends Node

## Player-facing graphics options, saved to user:// and applied live.
##
## The option list is the profiling result, not a guess: at 1080p the parallax
## ground costs 3.56 ms of a 9.64 ms frame, render scale 0.75 -> 1.0 costs 1.4 ms,
## and every other subsystem measured under 0.6 ms. So detail and scale get their
## own controls and the cheap systems ride the preset instead of cluttering the
## menu with toggles that buy nothing.

signal changed

const CONFIG_PATH := "user://graphics.cfg"

enum Detail { OFF, LOW, HIGH }

const DETAIL_NAMES := ["Off", "Low", "High"]
const PRESET_NAMES := ["Low", "Medium", "High", "Custom"]

## pom_strength, pom_layers_max, pom_shadow_strength per detail step. Low drops
## the layer count and the self-shadow march, which together are the part of the
## cost that came from chasing grazing-angle smear.
const DETAIL_POM := [
	{"strength": 0.0, "layers": 24.0, "shadow": 0.0},
	{"strength": 1.0, "layers": 24.0, "shadow": 0.0},
	{"strength": 1.0, "layers": 48.0, "shadow": 0.7},
]

## Blades per square metre, absolute rather than a fraction of whatever the
## field happens to ship with -- the Rust default has already moved 250 -> 150,
## and a percentage would have silently meant a different density either side of
## that change. Near-camera density is where grass cost lives; blade_range buys
## far less for the same loss.
const GRASS_STEPS := [40.0, 80.0, 150.0, 250.0, 400.0]

const PRESETS := [
	{"scale": 0.7, "detail": Detail.OFF, "shadows": false, "grass": 40.0, "post": false},
	{"scale": 0.85, "detail": Detail.LOW, "shadows": true, "grass": 80.0, "post": true},
	{"scale": 1.0, "detail": Detail.HIGH, "shadows": true, "grass": 150.0, "post": true},
]

var render_scale := 1.0
var detail := Detail.HIGH
var shadows := true
var grass_blades := 150.0
var postfx := true

var _ground: ShaderMaterial
var _grass: Node
var _day: Node
var _post: CanvasLayer
var _grass_base_blades := 0.0


func _ready() -> void:
	var main := get_parent()
	if main:
		var g := main.get_node_or_null("Ground") as MeshInstance3D
		if g and g.material_override is ShaderMaterial:
			_ground = g.material_override
		_grass = main.get_node_or_null("GrassField")
		_day = main.get_node_or_null("DayNight")
		_post = main.get_node_or_null("PostFX") as CanvasLayer
	# Whatever the field readied with is the default, so the mobile profile in
	# main.gd still decides the starting point on phones.
	if _grass:
		_grass_base_blades = float(_grass.get("blades_per_sqm"))
		grass_blades = _grass_base_blades
	load_settings()
	# The fields read their own exports during _ready, which runs after this node
	# on some orderings, so the first apply waits a frame rather than racing them.
	apply.call_deferred()


func preset_index() -> int:
	for i in PRESETS.size():
		var p: Dictionary = PRESETS[i]
		if is_equal_approx(p.scale, render_scale) and p.detail == detail \
				and p.shadows == shadows and is_equal_approx(p.grass, grass_blades) \
				and p.post == postfx:
			return i
	return PRESET_NAMES.size() - 1


func apply_preset(index: int) -> void:
	if index < 0 or index >= PRESETS.size():
		return
	var p: Dictionary = PRESETS[index]
	render_scale = p.scale
	detail = p.detail
	shadows = p.shadows
	grass_blades = p.grass
	postfx = p.post
	apply()


func apply() -> void:
	get_viewport().scaling_3d_scale = clampf(render_scale, 0.5, 1.0)

	if _ground:
		var d: Dictionary = DETAIL_POM[clampi(detail, 0, DETAIL_POM.size() - 1)]
		_ground.set_shader_parameter("pom_strength", d.strength)
		_ground.set_shader_parameter("pom_layers_max", d.layers)
		_ground.set_shader_parameter("pom_shadow_strength", d.shadow)

	if _grass:
		_grass.set("blades_per_sqm", clampf(grass_blades, 10.0, 600.0))

	if _day:
		_day.set("shadows_enabled", shadows)

	if _post:
		_post.visible = postfx

	save_settings()
	changed.emit()


func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		return
	render_scale = cfg.get_value("graphics", "render_scale", render_scale)
	detail = cfg.get_value("graphics", "detail", detail)
	shadows = cfg.get_value("graphics", "shadows", shadows)
	grass_blades = cfg.get_value("graphics", "grass_blades", grass_blades)
	postfx = cfg.get_value("graphics", "postfx", postfx)


func save_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("graphics", "render_scale", render_scale)
	cfg.set_value("graphics", "detail", detail)
	cfg.set_value("graphics", "shadows", shadows)
	cfg.set_value("graphics", "grass_blades", grass_blades)
	cfg.set_value("graphics", "postfx", postfx)
	cfg.save(CONFIG_PATH)
