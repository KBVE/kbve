extends GdUnitTestSuite


const LandmarkFolk := preload("res://src/npc/landmark_folk.gd")

## Wide enough to reach a built place from the spawn point. The shipped window is not,
## on purpose -- a capital you can see from where you start is not one worth walking to.
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


## A body is whatever the editor hands the spawner. The test needs one that costs
## nothing, since what is being checked is the roster and not the rigging.
func _stand_in() -> PackedScene:
	var node := Node3D.new()
	node.name = "StandIn"
	var scene := PackedScene.new()
	scene.pack(node)
	node.free()
	return scene


func test_every_post_says_where_and_which_way() -> void:
	var terrain: QTerrain = await _baked_terrain()
	assert_object(terrain).is_not_null()

	var posts: Array = terrain.landmark_posts()
	assert_int(posts.size()).override_failure_message(
		"a window this wide reaches a landmark, and every landmark is lived in"
	).is_greater(0)

	var roles := {}
	for post: Dictionary in posts:
		assert_bool(post.has("role")).is_true()
		assert_bool(post.has("at")).is_true()
		assert_bool(post.has("facing")).is_true()
		roles[post["role"]] = true
		var at: Vector3 = post["at"]
		var facing: Vector3 = post["facing"]
		assert_float(at.distance_to(facing)).override_failure_message(
			"%s is looking at its own feet" % post["role"]
		).is_greater(1.0)
		# The post carries the levelled floor, so a caller does not have to sample the
		# ground to find out somebody is standing on a courtyard.
		#
		# Checked against the ground mesh rather than the analytic pad, because the mesh
		# is what anybody actually stands on -- a vertex every couple of metres over a
		# baked grid coarser than that, so the pad arrives with its edges rounded off.
		# The margin is the room that rounding needs; the exact levelling is asserted in
		# the crate, where there is no grid in the way.
		assert_float(absf(at.y - terrain.height_at(at.x, at.z))).override_failure_message(
			"%s at %s is not standing on the ground under it" % [post["role"], at]
		).is_less(0.25)
	assert_int(roles.size()).override_failure_message(
		"only one kind of person in the whole world: %s" % [roles.keys()]
	).is_greater(1)


## The landmarks stream, so their people have to. A city walked away from that keeps
## paying for four rigs and four conversations nobody can reach is a leak that grows
## with every city visited.
func test_folk_arrive_for_the_posts_and_leave_with_them() -> void:
	var terrain: QTerrain = await _baked_terrain()
	assert_object(terrain).is_not_null()

	var folk := LandmarkFolk.new()
	folk.terrain_path = ^""
	var stand_in := _stand_in()
	folk.gate_guard = stand_in
	folk.trader = stand_in
	folk.steward = stand_in
	folk.dockhand = stand_in
	folk.harbourmaster = stand_in
	add_child(folk)
	auto_free(folk)
	folk._terrain = terrain

	folk._settle()
	var wanted: int = terrain.landmark_posts().size()
	assert_int(folk.get_child_count()).override_failure_message(
		"nobody turned up for %d posts" % wanted
	).is_equal(wanted)

	# Settling again must not stand a second set up beside the first. The roster is
	# keyed by which post, so the same post has to recognise the person already on it.
	folk._settle()
	assert_int(folk.get_child_count()).override_failure_message(
		"a second shift arrived and nobody went home"
	).is_equal(wanted)

	# Walk away. A narrow window reaches nothing built, and everybody should go home
	# rather than stay standing in ground that is no longer baked.
	var narrow := QTerrain.new()
	narrow.extent = 128.0
	add_child(narrow)
	auto_free(narrow)
	for frame in 600:
		await get_tree().process_frame
		if narrow.is_ground_ready():
			break
	assert_int(narrow.landmark_posts().size()).override_failure_message(
		"the narrow window was supposed to reach nothing"
	).is_equal(0)

	folk._terrain = narrow
	folk._settle()
	assert_int(folk._folk.size()).override_failure_message(
		"the city emptied but its people stayed"
	).is_equal(0)


## A role the editor has not been given a body for is left empty rather than filled
## with something wrong. An untextured box standing at a gate reads as a bug; an empty
## gate reads as a gate.
func test_a_role_with_no_body_is_left_unfilled() -> void:
	var terrain: QTerrain = await _baked_terrain()
	assert_object(terrain).is_not_null()

	var folk := LandmarkFolk.new()
	add_child(folk)
	auto_free(folk)
	folk._terrain = terrain
	folk._settle()

	assert_int(folk.get_child_count()).override_failure_message(
		"placeholders were stood up for roles with no body"
	).is_equal(0)
