extends GdUnitTestSuite

## Guards the wiring every playable scene needs but nothing enforces.

const SCENES := [
	"res://scenes/main.tscn",
	"res://scenes/title.tscn",
	"res://scenes/online.tscn",
]

## Every material QTerrain draws with.
const TERRAIN_MATERIALS := [
	&"ground_material",
	&"water_material",
	&"riverbed_material",
	&"bridge_material",
	&"abutment_material",
]

## Settings nodes are looked up by name from the pause menu's parent, so a scene that
## omits them silently loses the graphics and gameplay pages — which is how the title
## screen ended up with a settings book that had nothing in it.
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


## A QFishField with no model or materials places its fish, simulates them and draws
## nothing — the same silent shape as the bridge, and just as invisible outside a
## screenshot.
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


## Scenes whose ground the server also simulates. It spawns a collider for every
## rock its own scatter places whether or not the client draws them, so a scene with
## no QStoneField is one where players walk into rocks that are not there.
const STONE_SCENES := ["res://scenes/main.tscn", "res://scenes/online.tscn"]

## Tuning the server takes from `StoneScatter::default()` and cannot be told about.
## A scene that overrides any of it scatters rocks the server did not place, which
## reads as rocks you cannot touch and walls you cannot see.
const STONE_SHARED_TUNING := [
	&"stone_seed",
	&"grid_size",
	&"patch_threshold",
	&"patch_frequency",
	&"scale_min",
	&"scale_max",
]


func test_every_simulated_scene_draws_the_rocks_it_collides_with() -> void:
	for path in STONE_SCENES:
		var state := _state(path)
		var seen := false
		for i in state.get_node_count():
			if state.get_node_type(i) != &"QStoneField":
				continue
			seen = true
			var props := _properties_of(state, i)
			assert_object(props.get(&"stone_material")) \
				.override_failure_message("%s: QStoneField has no stone_material" % path) \
				.is_not_null()
			assert_bool(props.has(&"terrain_path")) \
				.override_failure_message("%s: QStoneField has no terrain_path" % path) \
				.is_true()
		assert_bool(seen) \
			.override_failure_message(
				"%s has no QStoneField — the server still collides with the rocks" % path) \
			.is_true()


func test_no_scene_retunes_the_scatter_the_server_shares() -> void:
	for path in STONE_SCENES:
		var state := _state(path)
		for i in state.get_node_count():
			if state.get_node_type(i) != &"QStoneField":
				continue
			var props := _properties_of(state, i)
			for key in STONE_SHARED_TUNING:
				assert_bool(props.has(key)) \
					.override_failure_message(
						"%s: QStoneField overrides %s, which the server takes from its own defaults" \
						% [path, key]) \
					.is_false()


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
