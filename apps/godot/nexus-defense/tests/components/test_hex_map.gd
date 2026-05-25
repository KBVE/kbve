extends GdUnitTestSuite

const HexMap := preload("res://ui/components/hex_map.gd")

func _spawn(radius: int = 4) -> Node2D:
	var m: Node2D = auto_free(HexMap.new())
	m.set("radius", radius)
	add_child(m)
	return m

func test_recomputes_hex_count_for_radius() -> void:
	var m: Node2D = _spawn(2)
	await await_idle_frame()
	var hexes: Array = m.get("_hexes")
	assert_int(hexes.size()).is_equal(19)

func test_recomputes_hex_count_for_radius_zero() -> void:
	var m: Node2D = _spawn(0)
	await await_idle_frame()
	var hexes: Array = m.get("_hexes")
	assert_int(hexes.size()).is_equal(1)

func test_set_path_stores_axials_and_redraws() -> void:
	var m: Node2D = _spawn()
	await await_idle_frame()
	var path: Array[Vector2i] = [Vector2i(0, 0), Vector2i(1, 0)]
	m.call("set_path", path)
	var stored: Array = m.get("path_axials")
	assert_int(stored.size()).is_equal(2)

func test_contains_axial_inside_and_outside() -> void:
	var m: Node2D = _spawn(3)
	await await_idle_frame()
	assert_bool(bool(m.call("contains_axial", Vector2i(0, 0)))).is_true()
	assert_bool(bool(m.call("contains_axial", Vector2i(3, 0)))).is_true()
	assert_bool(bool(m.call("contains_axial", Vector2i(4, 0)))).is_false()
	assert_bool(bool(m.call("contains_axial", Vector2i(2, 2)))).is_false()

func test_pixel_to_axial_round_trip() -> void:
	var m: Node2D = _spawn(4)
	await await_idle_frame()
	for axial in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-2, 1)]:
		var pix: Vector2 = m.call("axial_to_pixel", axial.x, axial.y)
		var got: Vector2i = m.call("pixel_to_axial", pix)
		assert_that(got).is_equal(axial)

func test_set_hover_updates_state_and_validity() -> void:
	var m: Node2D = _spawn()
	await await_idle_frame()
	m.call("set_hover", Vector2i(1, -1), true)
	assert_that(m.get("hover_axial")).is_equal(Vector2i(1, -1))
	assert_bool(bool(m.get("hover_valid"))).is_true()
	m.call("set_hover", Vector2i(1, -1), false)
	assert_bool(bool(m.get("hover_valid"))).is_false()
	m.call("clear_hover")
	assert_that(m.get("hover_axial")).is_null()

func test_occupied_axial_is_not_buildable() -> void:
	var m: Node2D = _spawn()
	await await_idle_frame()
	var occupied: Array[Vector2i] = [Vector2i(0, 0)]
	m.call("set_occupied", occupied)
	assert_bool(bool(m.call("is_axial_buildable", Vector2i(0, 0)))).is_false()
	assert_bool(bool(m.call("is_axial_buildable", Vector2i(1, 0)))).is_true()

func test_out_of_range_axial_is_not_buildable() -> void:
	var m: Node2D = _spawn(2)
	await await_idle_frame()
	assert_bool(bool(m.call("is_axial_buildable", Vector2i(5, 0)))).is_false()
