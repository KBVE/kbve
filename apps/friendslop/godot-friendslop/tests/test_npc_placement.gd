extends GdUnitTestSuite

const Actor := preload("res://src/npc/npc_actor.gd")
const WORLD := "res://scenes/main.tscn"

var _terrain: Node3D


func before_test() -> void:
	_terrain = ClassDB.instantiate("QTerrain")
	add_child(_terrain)
	auto_free(_terrain)
	for _i in 600:
		if _terrain.is_ground_ready():
			return
		await get_tree().process_frame


func test_the_ground_is_baked_before_anything_is_asked_of_it() -> void:
	assert_bool(_terrain.is_ground_ready()) \
			.override_failure_message("the terrain never finished baking, so nothing below means anything") \
			.is_true()
	assert_int(_terrain.bridge_span().size()) \
			.override_failure_message("this world has no crossing to stand beside").is_equal(5)


func test_nobody_at_the_crossing_is_standing_in_the_river() -> void:
	var span: PackedFloat32Array = _terrain.bridge_span()
	var water: float = _terrain.water_level_at()
	var middle := _middle(span)
	var along := _along(span)

	var authored := _authored_stands()
	assert_int(authored.size()) \
			.override_failure_message("no NPC in the world scene stands by the crossing") \
			.is_greater(4)

	for who: String in authored:
		var raw: Vector3 = Actor.bridge_spot(span, authored[who][0], authored[who][1])
		var at: Vector3 = Actor.dry_spot(_terrain, raw, middle, along)
		var ground: float = _terrain.height_at(at.x, at.z)
		assert_float(ground) \
				.override_failure_message("%s is standing in the river: ground %.2f, water %.2f" % [
					who, ground, water]) \
				.is_greater(water)


func test_somebody_authored_into_the_water_is_walked_out_of_it() -> void:
	var span: PackedFloat32Array = _terrain.bridge_span()
	var water: float = _terrain.water_level_at()
	var middle := _middle(span)
	var along := _along(span)

	var midstream: Vector3 = Actor.bridge_spot(span, 2.0, 0.0)
	assert_float(_terrain.height_at(midstream.x, midstream.z)) \
			.override_failure_message("the middle of the crossing is not over water, so this proves nothing") \
			.is_less(water)

	var rescued: Vector3 = Actor.dry_spot(_terrain, midstream, middle, along)
	assert_float(_terrain.height_at(rescued.x, rescued.z)) \
			.override_failure_message("a spot in the river was left in the river") \
			.is_greater(water)
	assert_float(rescued.distance_to(midstream)) \
			.override_failure_message("nothing moved, so nothing was rescued").is_greater(0.0)


func test_a_dry_spot_is_left_where_it_was_authored() -> void:
	var span: PackedFloat32Array = _terrain.bridge_span()
	var middle := _middle(span)
	var along := _along(span)
	var bank: Vector3 = Actor.bridge_spot(span, 2.0, 20.0)

	assert_vector(Actor.dry_spot(_terrain, bank, middle, along)) \
			.override_failure_message("somebody standing on dry land was moved anyway") \
			.is_equal(bank)


func _authored_stands() -> Dictionary:
	var text := FileAccess.get_file_as_string(WORLD)
	var out := {}
	var who := ""
	var stands := false
	var offset := 2.0
	var along := 9.0
	for line in text.split("\n"):
		if line.begins_with("[node name="):
			if stands and who != "":
				out[who] = [offset, along]
			who = line.get_slice("\"", 1)
			stands = false
			offset = 2.0
			along = 9.0
		elif line.begins_with("stand_under_bridge = true"):
			stands = true
		elif line.begins_with("bridge_offset = "):
			offset = float(line.get_slice("= ", 1))
		elif line.begins_with("bridge_along = "):
			along = float(line.get_slice("= ", 1))
	if stands and who != "":
		out[who] = [offset, along]
	return out


func _middle(span: PackedFloat32Array) -> Vector3:
	return (Vector3(span[0], 0.0, span[1]) + Vector3(span[2], 0.0, span[3])) * 0.5


func _along(span: PackedFloat32Array) -> Vector3:
	return (Vector3(span[2], 0.0, span[3]) - Vector3(span[0], 0.0, span[1])).normalized()
