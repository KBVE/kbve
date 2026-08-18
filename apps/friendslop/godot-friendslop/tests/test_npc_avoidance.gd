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


func test_a_villager_walks_around_what_is_in_the_way() -> void:
	var clock := _clock(8.035)
	var actor: Node3D = Actor.new()
	actor.npc_ref = "wren"
	actor.stand_under_bridge = false
	actor.terrain_path = NodePath("../Terrain")
	actor.physics_path = NodePath("../Physics")
	add_child(actor)
	auto_free(actor)
	actor.clock_path = actor.get_path_to(clock)
	assert_bool(await _until(func() -> bool: return actor._routine != null)) \
			.override_failure_message("wren has no routine, so there is no walk to block") \
			.is_true()
	await _until(func() -> bool: return actor._sim_id != 0)

	var leg := Vector3(-2.5, 0.0, 5.0).normalized()
	var start := actor.global_position
	var wall := start + leg * 2.2
	wall.y = _terrain.height_at(wall.x, wall.z) + 1.0
	var box := Node3D.new()
	add_child(box)
	auto_free(box)
	box.global_position = wall
	var box_id: int = _physics.spawn_static_box(box, Vector3(0.9, 2.0, 0.9))
	assert_int(box_id).is_not_equal(0)

	var target := actor._routine.at(8.035)["at"] as Vector3
	var arrived := await _until(func() -> bool:
		var flat := actor.global_position - target
		flat.y = 0.0
		return flat.length() < 0.8)
	_physics.despawn(box_id)
	assert_bool(arrived) \
			.override_failure_message("wren wedged against the box instead of walking around it: ended %.1fm short" % [
				Vector3(actor.global_position.x - target.x, 0.0, actor.global_position.z - target.z).length()]) \
			.is_true()


func test_an_open_walk_is_not_disturbed_by_the_steering() -> void:
	var clock := _clock(8.035)
	var actor: Node3D = Actor.new()
	actor.npc_ref = "wren"
	actor.stand_under_bridge = false
	actor.terrain_path = NodePath("../Terrain")
	actor.physics_path = NodePath("../Physics")
	add_child(actor)
	auto_free(actor)
	actor.clock_path = actor.get_path_to(clock)
	await _until(func() -> bool: return actor._routine != null)
	await _until(func() -> bool: return actor._sim_id != 0)

	var target := actor._routine.at(8.035)["at"] as Vector3
	assert_bool(await _until(func() -> bool:
		var flat := actor.global_position - target
		flat.y = 0.0
		return flat.length() < 0.8)) \
			.override_failure_message("an unobstructed walk never arrived") \
			.is_true()


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
	for _i in 900:
		if check.call():
			return true
		await get_tree().process_frame
	return check.call()
