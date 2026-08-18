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


func test_the_routine_class_is_in_the_extension() -> void:
	assert_bool(ClassDB.class_exists("QRoutine")) \
			.override_failure_message("QRoutine is missing, so no NPC can walk anywhere") \
			.is_true()


func test_a_walker_leans_toward_its_post_and_stops_when_it_gets_there() -> void:
	var walk := QRoutine.create()
	walk.add_post(Vector3(0.0, 0.0, 8.0), 30.0)
	var out: Dictionary = walk.step(Vector3.ZERO, 0.1)
	assert_vector(out["wish"]).is_equal_approx(Vector3(0.0, 0.0, 1.0), Vector3.ONE * 0.001)

	var landed: Dictionary = walk.step(Vector3(0.0, 0.0, 8.0), 0.1)
	assert_bool(landed["arrived"]).is_true()
	assert_vector(landed["wish"]).is_equal(Vector3.ZERO)


func test_every_authored_post_is_on_dry_ground() -> void:
	var span: PackedFloat32Array = _terrain.bridge_span()
	var water: float = _terrain.water_level_at()
	var middle := _middle(span)
	var along := _along(span)

	var routes := _authored_routes()
	assert_int(routes.size()) \
			.override_failure_message("no NPC in the world scene walks anywhere") \
			.is_greater(0)

	for who: String in routes:
		var stand: Array = routes[who][0]
		for step: Vector3 in routes[who][1]:
			var raw: Vector3 = Actor.bridge_spot(span, stand[0] + step.x, stand[1] + step.z)
			var at: Vector3 = Actor.dry_spot(_terrain, raw, middle, along)
			var ground: float = _terrain.height_at(at.x, at.z)
			assert_float(ground) \
					.override_failure_message("%s walks into the river at %s: ground %.2f, water %.2f" % [
						who, step, ground, water]) \
					.is_greater(water)


func test_an_npc_without_a_route_stays_put() -> void:
	var actor: Node3D = await _actor([])
	var was := actor.global_position
	for _i in 40:
		actor._physics_process(0.1)
	assert_vector(actor.global_position).is_equal(was)


func test_an_npc_with_a_route_walks_it() -> void:
	var actor: Node3D = await _actor([Vector3(0.0, 0.0, 6.0)])
	var was := actor.global_position
	for _i in 40:
		actor._physics_process(0.1)
	assert_float(actor.global_position.distance_to(was)) \
			.override_failure_message("the route was laid but nobody walked it") \
			.is_greater(1.0)


func test_being_spoken_to_stops_the_walk() -> void:
	var actor: Node3D = await _actor([Vector3(0.0, 0.0, 6.0)])
	var listener := _listener(actor.global_position + Vector3(0.0, 0.0, 1.0))
	actor.face(listener)
	var was := actor.global_position
	for _i in 40:
		actor._physics_process(0.1)
	assert_vector(actor.global_position) \
			.override_failure_message("somebody walked off mid-conversation").is_equal(was)

	actor.rest()
	for _i in 40:
		actor._physics_process(0.1)
	assert_float(actor.global_position.distance_to(was)) \
			.override_failure_message("the walk never resumed after the talk ended") \
			.is_greater(1.0)


func test_a_hold_nobody_ever_lifts_is_lifted_by_walking_away() -> void:
	var actor: Node3D = await _actor([Vector3(0.0, 0.0, 6.0)])
	var listener := _listener(actor.global_position + Vector3(0.0, 0.0, 1.0))
	actor.face(listener)
	actor._physics_process(0.1)
	listener.global_position = actor.global_position + Vector3(0.0, 0.0, 400.0)

	var was := actor.global_position
	for _i in 40:
		actor._physics_process(0.1)
	assert_float(actor.global_position.distance_to(was)) \
			.override_failure_message("left standing still by a conversation that walked off") \
			.is_greater(1.0)


func _actor(route: Array[Vector3]) -> Node3D:
	var actor: Node3D = Actor.new()
	actor.route = route
	actor.route_dwell = 0.0
	add_child(actor)
	auto_free(actor)
	await get_tree().process_frame
	return actor


func _listener(at: Vector3) -> Node3D:
	var node := Node3D.new()
	add_child(node)
	auto_free(node)
	node.global_position = at
	return node


func _authored_routes() -> Dictionary:
	var text := FileAccess.get_file_as_string(WORLD)
	var out := {}
	var who := ""
	var stands := false
	var offset := 2.0
	var along := 9.0
	var route: Array[Vector3] = []
	for line in text.split("\n"):
		if line.begins_with("[node name="):
			if stands and not route.is_empty():
				out[who] = [[offset, along], route]
			who = line.get_slice("\"", 1)
			stands = false
			offset = 2.0
			along = 9.0
			route = []
		elif line.begins_with("stand_under_bridge = true"):
			stands = true
		elif line.begins_with("bridge_offset = "):
			offset = float(line.get_slice("= ", 1))
		elif line.begins_with("bridge_along = "):
			along = float(line.get_slice("= ", 1))
		elif line.begins_with("route = Array[Vector3]("):
			route = _steps(line)
	if stands and not route.is_empty():
		out[who] = [[offset, along], route]
	return out


func _steps(line: String) -> Array[Vector3]:
	var out: Array[Vector3] = []
	for chunk in line.split("Vector3("):
		var body := chunk.get_slice(")", 0)
		var parts := body.split(",")
		if parts.size() != 3:
			continue
		out.append(Vector3(float(parts[0]), float(parts[1]), float(parts[2])))
	return out


func _middle(span: PackedFloat32Array) -> Vector3:
	return (Vector3(span[0], 0.0, span[1]) + Vector3(span[2], 0.0, span[3])) * 0.5


func _along(span: PackedFloat32Array) -> Vector3:
	return (Vector3(span[2], 0.0, span[3]) - Vector3(span[0], 0.0, span[1])).normalized()
