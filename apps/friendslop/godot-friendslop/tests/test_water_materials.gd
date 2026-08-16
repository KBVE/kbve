extends GdUnitTestSuite

## Guards the names QTerrain reaches into the water materials by.
##
## The whole water look is driven from Rust through `set_shader_parameter` and
## `get_shader_parameter`, and most of the reads carry a hardcoded fallback for when the
## material has nothing to say. That makes a renamed uniform silent: the water still
## draws, the compute pass still runs, and every authored value has quietly been replaced
## by whatever the default in the Rust happened to be. Nothing fails, it just stops
## looking like what was tuned.

const WATER := "res://assets/environment/water/water.tres"
const RIVERBED := "res://assets/environment/water/riverbed.tres"
const UNDERWATER := "res://assets/fx/shaders/underwater.tres"

## Read by `dispatch_water_fx` and the wake pass, and written by both.
const WATER_UNIFORMS := [
	"animation_fps",
	"brightness",
	"contrast",
	"enable_stepped_animation",
	"flow_direction",
	"flow_speed",
	"pattern_tex",
	"scale1",
	"smoothness",
	"wake_origin",
	"wake_tex",
	"wake_window",
	"z_flow_speed",
]

## The riverbed is shaped to the channel QTerrain carved, so these are measurements of the
## world rather than a look — wrong ones put the bed through the banks.
const RIVERBED_UNIFORMS := [
	"bed_edge_margin",
	"bed_half_width",
	"shore_fade_end",
]

## The bed and the bank meet, so the ground shader is told where the bed covers it and the
## bed is handed the ground's own palette to meet it with. Both halves of that handoff are
## addressed by name across two materials that nothing else connects.
const GROUND := "res://assets/biomes/grassland/grass/ground.tres"
const GROUND_UNIFORMS := [
	"bed_cover_half_width",
	"bed_cover_height",
	"clearance_tex",
	"soil_strength",
]

const UNDERWATER_UNIFORMS := ["submersion"]


func _uniforms(path: String) -> PackedStringArray:
	var material := load(path) as ShaderMaterial
	assert_object(material) \
		.override_failure_message("%s is not a ShaderMaterial" % path).is_not_null()
	assert_object(material.shader) \
		.override_failure_message("%s has no shader" % path).is_not_null()
	var names := PackedStringArray()
	for entry in material.shader.get_shader_uniform_list():
		names.append(String(entry.name))
	return names


func _assert_carries(path: String, wanted: Array) -> void:
	var names := _uniforms(path)
	for uniform in wanted:
		assert_bool(uniform in names) \
			.override_failure_message(
				"%s has no uniform '%s' — the code that drives it falls back to a default" \
				% [path, uniform]) \
			.is_true()


func test_the_water_carries_every_uniform_the_terrain_drives() -> void:
	_assert_carries(WATER, WATER_UNIFORMS)


func test_the_riverbed_carries_every_uniform_the_channel_measures() -> void:
	_assert_carries(RIVERBED, RIVERBED_UNIFORMS)


func test_the_ground_carries_the_handoff_to_the_riverbed() -> void:
	_assert_carries(GROUND, GROUND_UNIFORMS)


func test_the_underwater_pass_carries_its_submersion() -> void:
	_assert_carries(UNDERWATER, UNDERWATER_UNIFORMS)


## Water is drawn by QTerrain, so a scene that hands it the materials gets the river. The
## underwater tint is a separate fullscreen quad and has to be placed by hand, which is
## how a scene ends up with a river you can swim in and no sign that you have.
const SWIMMABLE_SCENES := ["res://scenes/main.tscn", "res://scenes/online.tscn"]


func test_every_swimmable_scene_can_show_that_you_are_under() -> void:
	for path in SWIMMABLE_SCENES:
		var packed := load(path) as PackedScene
		assert_object(packed).is_not_null()
		var state := packed.get_state()
		var found := false
		for i in state.get_node_count():
			if String(state.get_node_name(i)) != "Underwater":
				continue
			found = true
			var props := {}
			for p in state.get_node_property_count(i):
				props[state.get_node_property_name(i, p)] = state.get_node_property_value(i, p)
			assert_object(props.get(&"material")) \
				.override_failure_message("%s: Underwater has no material" % path).is_not_null()
			assert_bool(props.has(&"terrain_path")) \
				.override_failure_message("%s: Underwater has no terrain_path" % path).is_true()
		assert_bool(found) \
			.override_failure_message(
				"%s has no Underwater node — its river hides the surface from below" % path) \
			.is_true()
