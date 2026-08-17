extends GdUnitTestSuite

const Patrol := preload("res://src/characters/creature_patrol.gd")


class StubRig:
	extends Node3D

	const ATTACKS: Array[StringName] = [&"punch"]

	var display_name := "Stub"
	var speed_seen := 0.0

	func mesh_extents() -> AABB:
		return AABB(Vector3(-1.0, 0.0, -1.0), Vector3(2.0, 4.0, 2.0))

	func body_reach() -> float:
		return 1.0

	func is_dead() -> bool:
		return false

	func set_speed(value: float) -> void:
		speed_seen = value

	func play_action(_name: StringName) -> void:
		pass


func _creature(at: Vector3) -> CharacterBody3D:
	var body: CharacterBody3D = Patrol.new()
	var rig := StubRig.new()
	body.add_child(rig)
	body.rig = rig
	add_child(body)
	auto_free(body)
	body.global_position = at
	return body


func _tick(frames: int) -> void:
	for i in frames:
		await get_tree().physics_frame


func test_a_creature_in_the_air_falls() -> void:
	var body := _creature(Vector3(0.0, 50.0, 0.0))
	await _tick(2)
	var settled := body.global_position.y

	await _tick(30)

	assert_float(body.velocity.y) \
			.override_failure_message("nothing pulled the creature down") \
			.is_less(-1.0)
	assert_float(body.global_position.y) \
			.override_failure_message("the creature hung in the air where it was left") \
			.is_less(settled)


func test_the_fall_keeps_accelerating_after_the_first_frame() -> void:
	var body := _creature(Vector3(0.0, 50.0, 0.0))
	await _tick(2)
	var early := body.velocity.y

	await _tick(20)

	assert_float(body.velocity.y) \
			.override_failure_message(
					"the fall never sped up, which is what gravity read once on the frame "
					+ "the physics server still answers zero and then cached looks like") \
			.is_less(early - 1.0)
