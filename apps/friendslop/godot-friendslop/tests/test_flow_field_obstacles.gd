extends GdUnitTestSuite


const EXTENT := 64.0
const CELL := 4.0


func _open_field() -> QFlowField:
	var field := QFlowField.create(EXTENT, CELL)
	return field


func test_rocks_close_ground_and_trunks_only_cost() -> void:
	var rocks := PackedFloat32Array()
	var trunks := PackedFloat32Array()
	for i in 8:
		rocks.append_array(PackedFloat32Array([-20.0 + i * 4.0, 0.0, 2.5]))
		trunks.append_array(PackedFloat32Array([-20.0 + i * 4.0, 30.0, 0.3]))
	var rocky := _open_field()
	rocky.stamp_obstacles(rocks, 0.2, 220.0)
	rocky.build(Vector3(40.0, 0.0, 40.0))
	var wooded := _open_field()
	wooded.stamp_obstacles(trunks, 0.45, 160.0)
	wooded.build(Vector3(40.0, 0.0, 40.0))

	assert_bool(rocky.is_blocked(Vector3(-20.0, 0.0, 0.0))).is_true()
	assert_bool(wooded.is_blocked(Vector3(-20.0, 0.0, 30.0))).is_false()


func test_a_route_goes_round_a_line_of_rocks() -> void:
	var rocks := PackedFloat32Array()
	for i in 14:
		rocks.append_array(PackedFloat32Array([0.0, -60.0 + i * 4.0, 2.5]))
	var field := _open_field()
	field.stamp_obstacles(rocks, 0.2, 220.0)
	field.inflate(2.5)
	field.build(Vector3(40.0, 0.0, -50.0))

	var at := Vector3(-40.0, 0.0, -50.0)
	var furthest := at.z
	var arrived := false
	for step in 800:
		if at.distance_to(Vector3(40.0, 0.0, -50.0)) < CELL:
			arrived = true
			break
		var dir := field.direction_at(at)
		assert_vector(dir).override_failure_message(
			"field gave up at %s on step %d" % [at, step]
		).is_not_equal(Vector3.ZERO)
		at += dir * 1.0
		furthest = maxf(furthest, at.z)
	assert_bool(arrived).override_failure_message("never got past the rocks").is_true()
	assert_float(furthest).override_failure_message(
		"went straight through instead of round the end"
	).is_greater(-10.0)


func test_scatter_fields_hand_out_triples() -> void:
	var field := QTreeField.new()
	var discs: PackedFloat32Array = field.obstacle_discs()
	assert_int(discs.size() % 3).is_equal(0)
	field.free()

	var stones := QStoneField.new()
	var stone_discs: PackedFloat32Array = stones.obstacle_discs()
	assert_int(stone_discs.size() % 3).is_equal(0)
	stones.free()
