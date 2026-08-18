extends GdUnitTestSuite

const Actor := preload("res://src/npc/npc_actor.gd")

var _terrain: Node3D
var _physics: Node


func before_test() -> void:
	_terrain = ClassDB.instantiate("QTerrain")
	_terrain.name = "Terrain"
	add_child(_terrain)
	auto_free(_terrain)
	_physics = ClassDB.instantiate("QPhysics3D")
	_physics.name = "Physics"
	_physics.terrain_path = NodePath("../Terrain")
	add_child(_physics)
	auto_free(_physics)
	for _i in 900:
		if _terrain.is_ground_ready() and _physics.is_terrain_ready():
			return
		await get_tree().process_frame


func test_the_ground_reached_the_sim() -> void:
	assert_bool(_physics.is_terrain_ready()) \
			.override_failure_message("the sim never learned the terrain, so nothing below means anything") \
			.is_true()


func test_a_villager_takes_a_body_in_the_simulation() -> void:
	var actor := await _villager()
	assert_bool(await _until(func() -> bool: return actor._sim_id != 0)) \
			.override_failure_message("the villager never joined the simulation") \
			.is_true()


func test_a_villager_settles_onto_the_ground_the_sim_holds() -> void:
	var actor := await _villager()
	await _until(func() -> bool: return actor._sim_id != 0)
	assert_bool(await _until(func() -> bool:
		return _physics.character_grounded(actor._sim_id))) \
			.override_failure_message("the villager never found the ground") \
			.is_true()


func test_nobody_walks_through_a_villager() -> void:
	var actor := await _villager()
	await _until(func() -> bool:
		return actor._sim_id != 0 and _physics.character_grounded(actor._sim_id))

	var probe := Node3D.new()
	add_child(probe)
	auto_free(probe)
	var start := actor.global_position + Vector3(3.0, 0.1, 0.0)
	start.y = _terrain.height_at(start.x, start.z) + 0.1
	probe.global_position = start
	var probe_id: int = _physics.spawn_character(probe, 0.5, 0.4,
			Vector3(0.0, 1.0, 0.0), 4, 5)
	assert_int(probe_id).is_not_equal(0)

	for _i in 240:
		var down := -2.0 if _physics.character_grounded(probe_id) else -9.8
		_physics.move_character(probe_id, Vector3(-2.0, down, 0.0) * 0.05)
		await get_tree().process_frame
		var flat := probe.global_position - actor.global_position
		flat.y = 0.0
		assert_float(flat.length()) \
				.override_failure_message("the probe walked straight through the villager") \
				.is_greater(0.55)
	_physics.despawn(probe_id)


func test_without_a_simulation_the_villager_still_walks() -> void:
	var clock := _clock(10.0)
	var actor: Node3D = Actor.new()
	actor.npc_ref = "wren"
	actor.stand_under_bridge = false
	actor.physics_path = NodePath("nowhere")
	add_child(actor)
	auto_free(actor)
	actor.clock_path = actor.get_path_to(clock)
	actor._lay_route()
	var was := actor.global_position
	for _i in 60:
		actor._physics_process(0.1)
	assert_float(actor.global_position.distance_to(was)) \
			.override_failure_message("losing the sim also lost the walk") \
			.is_greater(1.0)


func _villager() -> Node3D:
	var clock := _clock(10.0)
	var actor: Node3D = Actor.new()
	actor.npc_ref = "marlow"
	actor.stand_under_bridge = true
	actor.terrain_path = NodePath("../Terrain")
	actor.physics_path = NodePath("../Physics")
	add_child(actor)
	auto_free(actor)
	actor.clock_path = actor.get_path_to(clock)
	await _until(func() -> bool: return actor._routine != null)
	assert_object(actor._routine) \
			.override_failure_message("marlow has no routine, so he never takes a body") \
			.is_not_null()
	return actor


func _clock(hour: float) -> Node:
	var script := GDScript.new()
	script.source_code = "extends Node\nvar hour := 0.0\nfunc hour_seconds() -> float:\n\treturn 112.5\n"
	script.reload()
	var node := Node.new()
	node.set_script(script)
	add_child(node)
	auto_free(node)
	node.hour = hour
	return node


func _until(check: Callable) -> bool:
	for _i in 600:
		if check.call():
			return true
		await get_tree().process_frame
	return check.call()
