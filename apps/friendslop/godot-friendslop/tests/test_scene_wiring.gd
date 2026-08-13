extends GdUnitTestSuite

## Guards the wiring every playable scene needs but nothing enforces.
##
## QTerrain builds its bridge, water and riverbed at runtime and assigns
## whatever materials it was handed. Hand it none and it still builds them —
## untextured white — so a missing material is invisible in code review and
## obvious only on screen, which is where the title screen's bridge was found.
##
## Read from the packed scene rather than by instantiating: `online.tscn` opens
## a socket in `_ready`, and a test suite is the wrong place to do that.

const SCENES := [
	"res://scenes/main.tscn",
	"res://scenes/title.tscn",
	"res://scenes/online.tscn",
]

## Every material QTerrain draws with. `grass_material` is deliberately absent:
## the fields own that, and a scene without grass is a legitimate scene.
const TERRAIN_MATERIALS := [
	&"ground_material",
	&"water_material",
	&"riverbed_material",
	&"bridge_material",
	&"abutment_material",
]

## Settings nodes are looked up by name from the pause menu's parent, so a scene
## that omits them silently loses the graphics and gameplay pages — which is how
## the title screen ended up with a settings book that had nothing in it.
const SETTINGS_NODES := ["GraphicsSettings", "GameplaySettings"]


func _state(path: String) -> SceneState:
	var packed := load(path) as PackedScene
	assert_object(packed).is_not_null()
	return packed.get_state()


func _properties_of(state: SceneState, node_index: int) -> Dictionary:
	var out := {}
	for i in state.get_node_property_count(node_index):
		out[state.get_node_property_name(node_index, i)] = state.get_node_property_value(node_index, i)
	return out


## A QFishField with no model or materials places its fish, simulates them and
## draws nothing — the same silent shape as the bridge, and just as invisible
## outside a screenshot.
const FISH_SCENES := ["res://scenes/main.tscn", "res://scenes/title.tscn"]
const FISH_RESOURCES := [&"fish_model", &"fish_material", &"shadow_material"]


func test_every_fish_field_can_draw() -> void:
	for path in FISH_SCENES:
		var state := _state(path)
		var seen := false
		for i in state.get_node_count():
			if state.get_node_type(i) != &"QFishField":
				continue
			seen = true
			var props := _properties_of(state, i)
			for key in FISH_RESOURCES:
				assert_object(props.get(key)) \
					.override_failure_message("%s: QFishField is missing %s" % [path, key]) \
					.is_not_null()
		assert_bool(seen) \
			.override_failure_message("%s has no QFishField" % path) \
			.is_true()


func test_every_terrain_is_handed_all_of_its_materials() -> void:
	for path in SCENES:
		var state := _state(path)
		var seen_terrain := false
		for i in state.get_node_count():
			if state.get_node_type(i) != &"QTerrain":
				continue
			seen_terrain = true
			var props := _properties_of(state, i)
			for key in TERRAIN_MATERIALS:
				assert_bool(props.has(key)) \
					.override_failure_message("%s: QTerrain is missing %s" % [path, key]) \
					.is_true()
				assert_object(props.get(key)) \
					.override_failure_message("%s: %s is null" % [path, key]) \
					.is_not_null()
		assert_bool(seen_terrain) \
			.override_failure_message("%s has no QTerrain — update this test" % path) \
			.is_true()


func test_every_world_scene_carries_its_settings_nodes() -> void:
	for path in SCENES:
		var state := _state(path)
		var names: Array[String] = []
		for i in state.get_node_count():
			names.append(String(state.get_node_name(i)))
		for wanted in SETTINGS_NODES:
			assert_array(names) \
				.override_failure_message("%s is missing the %s node" % [path, wanted]) \
				.contains([wanted])
