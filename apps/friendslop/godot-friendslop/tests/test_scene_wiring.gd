extends GdUnitTestSuite


const SCENES := [
	"res://scenes/main.tscn",
	"res://scenes/title.tscn",
	"res://scenes/online.tscn",
]

const TERRAIN_MATERIALS := [
	&"ground_material",
	&"water_material",
	&"riverbed_material",
	&"bridge_material",
	&"abutment_material",
]

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


const FISH_SCENES := [
	"res://scenes/main.tscn",
	"res://scenes/title.tscn",
	"res://scenes/online.tscn",
]
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


const STONE_SCENES := ["res://scenes/main.tscn", "res://scenes/online.tscn"]

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


## The online world adopts the host's scatter rather than drawing its own.
##
## Rocks and trees are never sent over the wire: both sides derive them from a seed and
## the ground. That holds only while both hold the same seed, and the client's fields
## plan from their exported defaults a round trip before anyone says what world this is.
## The join has to hand them the host's numbers -- and if any of these names drift, the
## call fails at runtime in a scene nobody loads under test.
func test_the_online_world_takes_its_scatter_from_the_host() -> void:
	var terrain: Object = ClassDB.instantiate(&"QTerrain")
	assert_bool(terrain.has_method(&"adopt_seed")) \
		.override_failure_message("QTerrain cannot be told which world it is baking") \
		.is_true()
	assert_bool(terrain.has_method(&"ground_generation")) \
		.override_failure_message("nothing tells a scatter its ground was replaced") \
		.is_true()

	terrain.free()

	for kind: StringName in [&"QStoneField", &"QTreeField"]:
		var field: Object = ClassDB.instantiate(kind)
		assert_bool(field.has_method(&"adopt_scatter")) \
			.override_failure_message("%s cannot adopt the host's scatter" % kind) \
			.is_true()
		field.free()

	var source := FileAccess.get_file_as_string("res://src/net/online_world.gd")
	for handover: String in ["adopt_seed(", "adopt_scatter("]:
		assert_bool(source.contains(handover)) \
			.override_failure_message(
				"online_world never calls %s — the client draws its own world again"
				% handover) \
			.is_true()
