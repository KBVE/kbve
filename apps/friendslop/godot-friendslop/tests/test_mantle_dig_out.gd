extends GdUnitTestSuite

## The last line of defence when the world puts something where a body stands:
## a capsule buried inside solid collision digs itself out rather than staying
## wedged forever. Random seeds rescatter rocks, and a rock through the player
## is exactly the case nothing else recovers from.

const Mantle := preload("res://src/player/mantle.gd")


func _box(size: Vector3, at: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	var col := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	col.shape = shape
	body.add_child(col)
	body.position = at
	return body


## Matches the player scene's convention exactly: the body's origin is its
## feet, with the capsule offset a metre up. The mantle teleports the origin to
## cleared FEET positions, so a harness that centres the capsule on the origin
## tests a body no scene contains.
func _player(at: Vector3) -> CharacterBody3D:
	var body := CharacterBody3D.new()
	var col := CollisionShape3D.new()
	col.name = "CollisionShape3D"
	var shape := CapsuleShape3D.new()
	shape.radius = 0.5
	shape.height = 2.0
	col.shape = shape
	col.position = Vector3(0.0, 1.0, 0.0)
	body.add_child(col)
	body.position = at
	return body


func _drive(body: CharacterBody3D, mantle: RefCounted, frames: int) -> void:
	for i in frames:
		body.velocity = Vector3(0.0, -1.0, 0.0)
		body.move_and_slide()
		mantle.update(1.0 / 60.0, Vector3.ZERO, false)
		await get_tree().physics_frame


## Pinched between two walls closer together than the capsule is wide, the
## engine's own pushes point at each other and cancel -- verified by running
## this exact scene without the mantle, where the body hangs in the pinch for
## the full minute. The dig-out is the only thing that gets it out.
func test_a_wedged_capsule_digs_itself_out() -> void:
	var root: Node3D = auto_free(Node3D.new())
	add_child(root)
	root.add_child(_box(Vector3(2.0, 1.5, 2.0), Vector3(-1.35, 0.75, 0.0)))
	root.add_child(_box(Vector3(2.0, 1.5, 2.0), Vector3(1.35, 0.75, 0.0)))
	var player := _player(Vector3.ZERO)
	root.add_child(player)
	var mantle: RefCounted = Mantle.new()
	mantle.setup(player, null)

	await _drive(player, mantle, 60)

	assert_float(player.global_position.y) \
		.override_failure_message("still wedged at %s" % player.global_position) \
		.is_greater(1.2)


func test_a_body_standing_on_ground_is_left_alone() -> void:
	var root: Node3D = auto_free(Node3D.new())
	add_child(root)
	root.add_child(_box(Vector3(8.0, 2.0, 8.0), Vector3(0.0, 1.0, 0.0)))
	var player := _player(Vector3(0.0, 2.05, 0.0))
	root.add_child(player)
	var mantle: RefCounted = Mantle.new()
	mantle.setup(player, null)

	await _drive(player, mantle, 60)

	assert_float(absf(player.global_position.x)).is_less(0.1)
	assert_float(absf(player.global_position.z)).is_less(0.1)
	assert_float(player.global_position.y).is_between(1.9, 2.2)
