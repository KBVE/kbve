extends Node

## Player-facing graphics options, saved to user:// and applied live.

signal changed

const CONFIG_PATH := "user://graphics.cfg"

enum Detail { OFF, LOW, HIGH }
enum Tier { POTATO, LOW, MEDIUM, HIGH, EPIC }

## Keys, not words: the menu translates them on the way to the page, and the tier arrays
## below are indexed by position either way.
const DETAIL_NAMES := [
	"settings.detail_name.off",
	"settings.detail_name.low",
	"settings.detail_name.high",
]
const PRESET_NAMES := [
	"settings.preset_name.potato",
	"settings.preset_name.low",
	"settings.preset_name.medium",
	"settings.preset_name.high",
	"settings.preset_name.epic",
	"settings.preset_name.custom",
]

## pom_strength, pom_layers_max, pom_shadow_strength per detail step.
const DETAIL_POM := [
	{"strength": 0.0, "layers": 24.0, "shadow": 0.0},
	{"strength": 1.0, "layers": 24.0, "shadow": 0.0},
	{"strength": 1.0, "layers": 48.0, "shadow": 0.7},
]

## Blades per square metre, absolute rather than a fraction of whatever the field
## happens to ship with -- the Rust default has already moved 250 -> 150, and a
## percentage would have silently meant a different density either side of that change.
const GRASS_STEPS := [40.0, 80.0, 150.0, 250.0, 400.0]

## One row per tier.
const TIERS := [
	{
		"scale": 0.5, "detail": Detail.OFF, "shadows": false, "shadow_distance": 30.0,
		"post": false, "msaa": Viewport.MSAA_DISABLED,
		"grass": {
			"blades_per_sqm": 40.0, "blade_range": 14.0, "thin_start": 8.0,
			"billboards": false, "grass_fade_out_end": 60.0,
		},
		"fields": {
			"TreeField": {"mesh_range": 35.0, "far_range": 110.0},
			"FloraField": {"fade_end": 25.0},
			"ShrubField": {"fade_end": 28.0},
		},
	},
	{
		"scale": 0.65, "detail": Detail.OFF, "shadows": true, "shadow_distance": 55.0,
		"post": false, "msaa": Viewport.MSAA_DISABLED,
		"grass": {
			"blades_per_sqm": 80.0, "blade_range": 22.0, "thin_start": 12.0,
			"billboards": false, "grass_fade_out_end": 100.0,
		},
		"fields": {
			"TreeField": {"mesh_range": 55.0, "far_range": 160.0},
			"FloraField": {"fade_end": 40.0},
			"ShrubField": {"fade_end": 45.0},
		},
	},
	{
		"scale": 0.85, "detail": Detail.LOW, "shadows": true, "shadow_distance": 90.0,
		"post": true, "msaa": Viewport.MSAA_2X,
		"grass": {
			"blades_per_sqm": 150.0, "blade_range": 30.0, "thin_start": 18.0,
			"billboards": true, "grass_fade_out_end": 150.0,
		},
		"fields": {
			"TreeField": {"mesh_range": 80.0, "far_range": 200.0},
			"FloraField": {"fade_end": 60.0},
			"ShrubField": {"fade_end": 65.0},
		},
	},
	{
		"scale": 1.0, "detail": Detail.HIGH, "shadows": true, "shadow_distance": 140.0,
		"post": true, "msaa": Viewport.MSAA_2X,
		"grass": {
			"blades_per_sqm": 250.0, "blade_range": 40.0, "thin_start": 25.0,
			"billboards": true, "grass_fade_out_end": 200.0,
		},
		"fields": {
			"TreeField": {"mesh_range": 110.0, "far_range": 260.0},
			"FloraField": {"fade_end": 90.0},
			"ShrubField": {"fade_end": 95.0},
		},
	},
	{
		"scale": 1.0, "detail": Detail.HIGH, "shadows": true, "shadow_distance": 200.0,
		"post": true, "msaa": Viewport.MSAA_4X,
		"grass": {
			"blades_per_sqm": 400.0, "blade_range": 55.0, "thin_start": 35.0,
			"billboards": true, "grass_fade_out_end": 260.0,
		},
		"fields": {
			"TreeField": {"mesh_range": 150.0, "far_range": 320.0},
			"FloraField": {"fade_end": 120.0},
			"ShrubField": {"fade_end": 130.0},
		},
	},
]

## Parallax is desktop-only for now.
const MOBILE_GROUND := {"pom_strength": 0.0, "detail_amount": 0.35}

var render_scale := 1.0
var detail := Detail.HIGH
var shadows := true
var grass_blades := 150.0
var postfx := true

var _ground: ShaderMaterial
var _riverbed: ShaderMaterial
var _grass: Node
var _day: Node
var _post: CanvasLayer


## The tier a fresh install starts on.
static func default_tier() -> int:
	return Tier.LOW if OS.has_feature("mobile") else Tier.HIGH


## Read by main.gd during _enter_tree, before this node exists, so it has to work off
## the file rather than off instance state.
static func saved_tier() -> int:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		return default_tier()
	var t: int = cfg.get_value("graphics", "tier", default_tier())
	return clampi(t, 0, TIERS.size() - 1)


## Field exports only take effect before the field readies, so this is called from
## main.gd's _enter_tree and again on a tier change (where the live setters re-stream
## what they can).
static func apply_fields(main: Node, tier: int) -> void:
	var row: Dictionary = TIERS[clampi(tier, 0, TIERS.size() - 1)]
	var grass := main.get_node_or_null(^"GrassField")
	if grass:
		for key in row.grass:
			grass.set(key, row.grass[key])
	for field_name in row.fields:
		var field := main.get_node_or_null(NodePath(field_name))
		if field == null:
			continue
		for key in row.fields[field_name]:
			field.set(key, row.fields[field_name][key])


func _ready() -> void:
	var main := get_parent()
	if main:
		var g := main.get_node_or_null("Ground") as MeshInstance3D
		if g and g.material_override is ShaderMaterial:
			_ground = g.material_override
		var terrain := main.get_node_or_null("Terrain")
		if terrain:
			_riverbed = terrain.get("riverbed_material") as ShaderMaterial
		_grass = main.get_node_or_null("GrassField")
		_day = main.get_node_or_null("DayNight")
		_post = main.get_node_or_null("PostFX") as CanvasLayer
	_seed_from_tier(saved_tier())
	load_settings()
	apply.call_deferred()


func _seed_from_tier(tier: int) -> void:
	var row: Dictionary = TIERS[clampi(tier, 0, TIERS.size() - 1)]
	render_scale = row.scale
	detail = row.detail
	shadows = row.shadows
	grass_blades = row.grass.blades_per_sqm
	postfx = row.post


func preset_index() -> int:
	for i in TIERS.size():
		var p: Dictionary = TIERS[i]
		if is_equal_approx(p.scale, render_scale) and p.detail == detail \
				and p.shadows == shadows \
				and is_equal_approx(p.grass.blades_per_sqm, grass_blades) \
				and p.post == postfx:
			return i
	return PRESET_NAMES.size() - 1


func apply_preset(index: int) -> void:
	if index < 0 or index >= TIERS.size():
		return
	_seed_from_tier(index)
	var main := get_parent()
	if main:
		apply_fields(main, index)
	apply()


func apply() -> void:
	var vp := get_viewport()
	vp.scaling_3d_scale = clampf(render_scale, 0.5, 1.0)
	vp.msaa_3d = TIERS[clampi(preset_index(), 0, TIERS.size() - 1)].msaa

	var d: Dictionary = DETAIL_POM[clampi(detail, 0, DETAIL_POM.size() - 1)]
	for m in [_ground, _riverbed]:
		if m == null:
			continue
		m.set_shader_parameter("pom_strength", d.strength)
		m.set_shader_parameter("pom_layers_max", d.layers)
		m.set_shader_parameter("pom_shadow_strength", d.shadow)
	if _ground and OS.has_feature("mobile"):
		for key in MOBILE_GROUND:
			_ground.set_shader_parameter(key, MOBILE_GROUND[key])

	if _grass:
		_grass.set("blades_per_sqm", clampf(grass_blades, 10.0, 600.0))

	if _day:
		_day.set("shadows_enabled", shadows)
	var distance: float = TIERS[clampi(preset_index(), 0, TIERS.size() - 1)].shadow_distance
	var main := get_parent()
	if main:
		for light_path in ["DayNight/Sun", "DayNight/Moon"]:
			var light := main.get_node_or_null(NodePath(light_path))
			if light:
				light.set("directional_shadow_max_distance", distance)

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
	cfg.set_value("graphics", "tier", preset_index())
	cfg.set_value("graphics", "render_scale", render_scale)
	cfg.set_value("graphics", "detail", detail)
	cfg.set_value("graphics", "shadows", shadows)
	cfg.set_value("graphics", "grass_blades", grass_blades)
	cfg.set_value("graphics", "postfx", postfx)
	cfg.save(CONFIG_PATH)
