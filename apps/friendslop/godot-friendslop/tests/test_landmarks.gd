extends GdUnitTestSuite


const CELL := 4.0

## Wide enough to reach the nearest built place from the spawn point, which the shipped
## window is not: a landmark you can see from where you start is not one worth walking
## to.
const WIDE := 768.0


func _baked_terrain() -> QTerrain:
	var terrain := QTerrain.new()
	terrain.extent = WIDE
	add_child(terrain)
	auto_free(terrain)
	for frame in 600:
		await get_tree().process_frame
		if terrain.is_ground_ready():
			return terrain
	return null


## The levelled ground a landmark stands on reads to a flow field as open, walkable
## country, because that is exactly what the height grid says it is. Every wall has to
## arrive separately or creatures walk through a capital.
func test_a_baked_window_hands_out_walls_as_lines() -> void:
	var terrain: QTerrain = await _baked_terrain()
	assert_object(terrain).override_failure_message(
		"the terrain never finished baking"
	).is_not_null()

	var plan: Dictionary = terrain.landmark_plan()
	assert_bool(plan.is_empty()).override_failure_message(
		"a window this wide reaches a landmark and should have built one"
	).is_false()

	var solid: PackedFloat32Array = plan["solid"]
	var opening: PackedFloat32Array = plan["open"]
	assert_int(solid.size() % 5).is_equal(0)
	assert_int(opening.size() % 5).is_equal(0)
	assert_int(solid.size()).is_greater(0)
	assert_int(opening.size()).override_failure_message(
		"something was built with no way into it"
	).is_greater(0)


## Answered from the world rather than the window, so it reaches places nothing has
## baked yet -- which is the only way it is useful for pointing somebody at one.
func test_a_capital_is_somewhere_a_player_can_be_sent() -> void:
	var terrain: QTerrain = await _baked_terrain()
	assert_object(terrain).is_not_null()

	var near: Dictionary = terrain.nearest_landmarks(Vector3.ZERO)
	assert_bool(near.has("capital")).override_failure_message(
		"the world has no capital to point anybody at"
	).is_true()
	assert_bool(near.has("harbour")).is_true()
	if not (near.has("capital") and near.has("harbour")):
		return

	var capital: Vector3 = near["capital"]
	var harbour: Vector3 = near["harbour"]
	assert_float(absf(harbour.x)).override_failure_message(
		"a harbour has to be on the river, and the river runs near x = 0"
	).is_less(160.0)
	# Not a fixed distance: how far a capital must keep from the channel is the
	# channel's own wander plus its walls, which the generator settings move.
	assert_float(absf(capital.x)).override_failure_message(
		"a capital that near the channel would dam it"
	).is_greater(absf(harbour.x) * 2.0)


## Solid lines close ground and open lines reopen it, and the order matters: a gateway
## reopened before the inflate is a gateway the inflate closes again.
func test_a_gateway_survives_the_inflate() -> void:
	var field := QFlowField.create(64.0, CELL)
	field.block_path(Vector3(-30.0, 0.0, 0.0), Vector3(30.0, 0.0, 0.0), 1.2)
	field.inflate(2.5)
	assert_bool(field.is_blocked(Vector3(0.0, 0.0, 0.0))).override_failure_message(
		"the wall did not close anything"
	).is_true()

	field.open_path(Vector3(-8.0, 0.0, 0.0), Vector3(8.0, 0.0, 0.0), 4.0, 40.0)
	assert_bool(field.is_blocked(Vector3(0.0, 0.0, 0.0))).override_failure_message(
		"the gateway is walled up"
	).is_false()
	# Further along the same wall, well past the gateway it was given.
	assert_bool(field.is_blocked(Vector3(22.0, 0.0, 0.0))).override_failure_message(
		"reopening the gateway knocked a hole in the rest of the wall"
	).is_true()
