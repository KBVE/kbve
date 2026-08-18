extends GdUnitTestSuite


const PLAYER := "res://scenes/player.tscn"
const MainScene := preload("res://src/main.gd")

const GROUND := 12.0


class FakeTerrain extends Node3D:
	signal ground_ready

	var ready_now := false
	var height := GROUND

	func is_ground_ready() -> bool:
		return ready_now

	func height_at(_x: float, _z: float) -> float:
		return height

	func arrive() -> void:
		ready_now = true
		ground_ready.emit()


class BareNode extends Node3D:
	pass


func _world(with_terrain: bool) -> Array:
	var root := Node3D.new()
	add_child(root)
	auto_free(root)
	var terrain: Node3D = FakeTerrain.new() if with_terrain else BareNode.new()
	terrain.name = "Terrain"
	root.add_child(terrain)
	var player: CharacterBody3D = (load(PLAYER) as PackedScene).instantiate()
	root.add_child(player)
	return [root, terrain, player]


func test_the_player_is_held_until_there_is_ground() -> void:
	var made := _world(true)
	var terrain: FakeTerrain = made[1]
	var player: CharacterBody3D = made[2]
	player.global_position = Vector3(0.0, 0.1, 0.0)

	for i in 8:
		player._physics_process(1.0 / 60.0)
	assert_float(player.global_position.y) \
			.override_failure_message("the player moved before there was ground under it") \
			.is_equal_approx(0.1, 0.001)
	assert_vector(player.velocity).is_equal(Vector3.ZERO)

	terrain.arrive()
	assert_float(player.global_position.y) \
			.override_failure_message("the player was not settled onto the ground") \
			.is_equal_approx(GROUND + player.settle_clearance, 0.001)


func test_a_player_that_readies_onto_finished_ground_is_never_held() -> void:
	var root := Node3D.new()
	add_child(root)
	auto_free(root)
	var terrain := FakeTerrain.new()
	terrain.name = "Terrain"
	terrain.ready_now = true
	root.add_child(terrain)
	var player: CharacterBody3D = (load(PLAYER) as PackedScene).instantiate()
	player.position = Vector3(0.0, GROUND + 4.0, 0.0)
	root.add_child(player)

	player._physics_process(1.0 / 60.0)
	assert_float(player.global_position.y) \
			.override_failure_message("a settle lifted a player that was already above ground") \
			.is_greater(GROUND)


func test_a_world_without_terrain_does_not_hold_the_player() -> void:
	var made := _world(false)
	var player: CharacterBody3D = made[2]
	player.global_position = Vector3(0.0, 40.0, 0.0)
	player._physics_process(1.0 / 60.0)
	assert_bool(player._held) \
			.override_failure_message("a terrain that cannot answer held the player forever") \
			.is_false()


func test_a_player_under_the_world_is_put_back_on_it() -> void:
	var made := _world(true)
	var terrain: FakeTerrain = made[1]
	var player: CharacterBody3D = made[2]
	terrain.arrive()
	player.global_position = Vector3(0.0, GROUND - player.fall_through_slack - 2.0, 0.0)

	player._physics_process(1.0 / 60.0)
	assert_float(player.global_position.y) \
			.override_failure_message("the player was left under the world") \
			.is_greater_equal(GROUND)


func test_a_dip_shallower_than_the_slack_is_left_alone() -> void:
	var made := _world(true)
	var terrain: FakeTerrain = made[1]
	var player: CharacterBody3D = made[2]
	terrain.arrive()
	var under: float = GROUND - player.fall_through_slack * 0.5
	player.global_position = Vector3(0.0, under, 0.0)

	player._physics_process(1.0 / 60.0)
	assert_float(player.global_position.y) \
			.override_failure_message("a body standing slightly low was teleported") \
			.is_less(GROUND)


func test_the_world_reports_when_it_has_ground() -> void:
	var world := Node3D.new()
	world.set_script(MainScene)
	add_child(world)
	auto_free(world)
	var terrain := FakeTerrain.new()
	terrain.name = "Terrain"
	world.add_child(terrain)

	assert_bool(world.world_ready()) \
			.override_failure_message("the cover would have lifted onto a world with no ground") \
			.is_false()
	terrain.arrive()
	assert_bool(world.world_ready()).is_true()


func test_a_world_that_cannot_answer_is_taken_as_ready() -> void:
	var world := Node3D.new()
	world.set_script(MainScene)
	add_child(world)
	auto_free(world)
	var bare := BareNode.new()
	bare.name = "Terrain"
	world.add_child(bare)

	assert_bool(world.world_ready()) \
			.override_failure_message("a scene with no QTerrain would hang behind the cover") \
			.is_true()
