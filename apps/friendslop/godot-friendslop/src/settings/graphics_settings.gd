extends Node


signal changed

const CONFIG_PATH := "user://graphics.cfg"

enum Detail { OFF, LOW, HIGH }
enum Tier { POTATO, LOW, MEDIUM, HIGH, EPIC }

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

enum Upscale { BILINEAR, FSR2, METALFX_SPATIAL, METALFX_TEMPORAL }

const UPSCALE_MODES := [
	Viewport.SCALING_3D_MODE_BILINEAR,
	Viewport.SCALING_3D_MODE_FSR2,
	Viewport.SCALING_3D_MODE_METALFX_SPATIAL,
	Viewport.SCALING_3D_MODE_METALFX_TEMPORAL,
]
const UPSCALE_NAMES := [
	"settings.upscale_name.bilinear",
	"settings.upscale_name.fsr2",
	"settings.upscale_name.metalfx_spatial",
	"settings.upscale_name.metalfx_temporal",
]

const DETAIL_POM := [
	{"strength": 0.0, "layers": 24.0, "shadow": 0.0},
	{"strength": 1.0, "layers": 24.0, "shadow": 0.0},
	{"strength": 1.0, "layers": 48.0, "shadow": 0.7},
]

const GRASS_STEPS := [40.0, 80.0, 150.0, 250.0, 400.0]

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

const MOBILE_GROUND := {"pom_strength": 0.0, "road_pom_strength": 0.0, "detail_amount": 0.35}

var render_scale := 1.0
var detail := Detail.HIGH
var shadows := true
var grass_blades := 150.0
var postfx := true
var upscale := Upscale.BILINEAR

var _ground: ShaderMaterial
var _riverbed: ShaderMaterial
var _grass: Node
var _day: Node
var _post: CanvasLayer


static func default_tier() -> int:
	return Tier.LOW if OS.has_feature("mobile") else Tier.HIGH


static func metal_driver() -> bool:
	if OS.has_feature("ios"):
		return true
	if not OS.has_feature("macos"):
		return false
	return str(ProjectSettings.get_setting("rendering/rendering_device/driver.macos", "")) == "metal"


static func metalfx_temporal_available() -> bool:
	if not metal_driver():
		return false
	return OS.has_feature("ios") or RenderingServer.get_video_adapter_name().begins_with("Apple")


static func available_upscalers() -> Array:
	var out: Array = [Upscale.BILINEAR, Upscale.FSR2]
	if metal_driver():
		out.append(Upscale.METALFX_SPATIAL)
		if metalfx_temporal_available():
			out.append(Upscale.METALFX_TEMPORAL)
	return out


static func saved_tier() -> int:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		return default_tier()
	var t: int = cfg.get_value("graphics", "tier", default_tier())
	return clampi(t, 0, TIERS.size() - 1)


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
	vp.scaling_3d_mode = UPSCALE_MODES[_upscale_index()]
	vp.msaa_3d = TIERS[clampi(preset_index(), 0, TIERS.size() - 1)].msaa

	var d: Dictionary = DETAIL_POM[clampi(detail, 0, DETAIL_POM.size() - 1)]
	for m in [_ground, _riverbed]:
		if m == null:
			continue
		m.set_shader_parameter("pom_strength", d.strength)
		m.set_shader_parameter("pom_layers_max", d.layers)
		m.set_shader_parameter("pom_shadow_strength", d.shadow)
	if _ground:
		_ground.set_shader_parameter("road_pom_strength", d.strength)
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


func _upscale_index() -> int:
	var env := OS.get_environment("Q_UPSCALE")
	if env != "":
		var wanted := UPSCALE_NAMES.find("settings.upscale_name.%s" % env)
		if wanted >= 0 and available_upscalers().has(wanted):
			return wanted
		push_warning("[gfx] Q_UPSCALE=%s is not available here" % env)
	return upscale if available_upscalers().has(upscale) else Upscale.BILINEAR


func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		return
	render_scale = cfg.get_value("graphics", "render_scale", render_scale)
	detail = cfg.get_value("graphics", "detail", detail)
	shadows = cfg.get_value("graphics", "shadows", shadows)
	grass_blades = cfg.get_value("graphics", "grass_blades", grass_blades)
	postfx = cfg.get_value("graphics", "postfx", postfx)
	upscale = cfg.get_value("graphics", "upscale", upscale)


func save_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("graphics", "tier", preset_index())
	cfg.set_value("graphics", "render_scale", render_scale)
	cfg.set_value("graphics", "detail", detail)
	cfg.set_value("graphics", "shadows", shadows)
	cfg.set_value("graphics", "grass_blades", grass_blades)
	cfg.set_value("graphics", "postfx", postfx)
	cfg.set_value("graphics", "upscale", upscale)
	cfg.save(CONFIG_PATH)
