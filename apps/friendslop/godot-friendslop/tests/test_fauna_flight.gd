extends GdUnitTestSuite

const FlightPathScript := preload("res://src/fauna/flight_path.gd")
const FlockScript := preload("res://src/fauna/flock.gd")


func _species() -> BirdSpecies:
	var s := BirdSpecies.new()
	s.orbit_radius = 6.0
	s.orbit_height = 4.5
	s.orbit_speed = 0.5
	s.follow_speed = 2.5
	s.glide_blend = 0.35
	s.swoop_depth = 2.2
	s.flap_speed = 9.0
	return s


func _perch() -> Node3D:
	var n := Node3D.new()
	add_child(n)
	auto_free(n)
	return n


func _fly(path: FlightPath, bird: Node3D, target: Node3D, steps: int, delta: float) -> void:
	for _i in steps:
		path.step(bird, target, delta)


func test_a_bird_with_nowhere_to_be_still_beats_its_wings() -> void:
	var path := FlightPathScript.new()
	path.setup(_species(), 0.0)
	var bird := _perch()
	bird.global_position = Vector3(3.0, 9.0, -2.0)

	_fly(path, bird, null, 20, 1.0 / 60.0)

	assert_vector(bird.global_position) \
			.override_failure_message("moved with no target to follow") \
			.is_equal(Vector3(3.0, 9.0, -2.0))
	assert_float(path.wing_phase) \
			.override_failure_message("wings stopped because there was nowhere to go") \
			.is_greater(0.0)


func test_a_bird_settles_onto_the_ring_it_orbits() -> void:
	var species := _species()
	var path := FlightPathScript.new()
	path.setup(species, 0.0)
	var bird := _perch()
	var target := _perch()
	target.global_position = Vector3(10.0, 0.0, 10.0)

	_fly(path, bird, target, 900, 1.0 / 60.0)

	var flat := bird.global_position - target.global_position
	flat.y = 0.0
	# The ring breathes, so this is the band the radius is modulated across
	# rather than one number.
	assert_float(flat.length()) \
			.override_failure_message("left its own orbit: %.2fm out" % flat.length()) \
			.is_between(species.orbit_radius * 0.6, species.orbit_radius * 1.4)
	assert_float(bird.global_position.y) \
			.override_failure_message("flying at the wrong altitude") \
			.is_greater(target.global_position.y)


func test_two_birds_given_the_same_start_fly_the_same_line() -> void:
	var mine := FlightPathScript.new()
	var theirs := FlightPathScript.new()
	mine.setup(_species(), 1.3)
	theirs.setup(_species(), 1.3)
	var a := _perch()
	var b := _perch()
	var target := _perch()

	for _i in 300:
		mine.step(a, target, 1.0 / 60.0)
		theirs.step(b, target, 1.0 / 60.0)

	assert_vector(a.global_position) \
			.override_failure_message("the same bird flew two different paths") \
			.is_equal_approx(b.global_position, Vector3.ONE * 0.0001)


func test_a_diving_bird_is_not_also_gliding() -> void:
	var path := FlightPathScript.new()
	path.setup(_species(), 0.0)
	var bird := _perch()
	var target := _perch()
	var seen_swoop := 0.0

	for _i in 4000:
		path.step(bird, target, 1.0 / 30.0)
		seen_swoop = maxf(seen_swoop, path.swoop)
		assert_float(path.swoop).is_between(0.0, 1.0)
		assert_float(path.glide).is_between(0.0, 1.0)
		# glide is scaled by (1 - swoop), so a full dive has to close it.
		if path.swoop > 0.99:
			assert_float(path.glide) \
					.override_failure_message("gliding through a full dive") \
					.is_less(0.01)

	assert_float(seen_swoop) \
			.override_failure_message("never dived, so the dive was never tested") \
			.is_greater(0.9)


func test_a_flock_fans_its_birds_out_rather_than_stacking_them() -> void:
	var player := _perch()
	var flock: Node3D = FlockScript.new()
	flock.species = _species()
	flock.count = 4
	add_child(flock)
	auto_free(flock)
	flock.player_path = flock.get_path_to(player)
	flock._ready()

	var birds: Array[Node] = flock.get_children()
	assert_int(birds.size()).is_equal(4)

	var seen: Array[float] = []
	var radii: Array[float] = []
	for b in birds:
		seen.append(b.phase)
		radii.append(b.species.orbit_radius)
	for i in range(1, radii.size()):
		assert_float(radii[i]) \
				.override_failure_message("two birds share an orbit and will fly through each other") \
				.is_greater(radii[i - 1])
		assert_float(seen[i]) \
				.override_failure_message("two birds start at the same point on the ring") \
				.is_not_equal(seen[i - 1])


func test_a_flock_does_not_edit_the_species_every_other_flock_shares() -> void:
	var player := _perch()
	var species := _species()
	var was := species.orbit_radius

	var flock: Node3D = FlockScript.new()
	flock.species = species
	flock.count = 3
	add_child(flock)
	auto_free(flock)
	flock.player_path = flock.get_path_to(player)
	flock._ready()

	assert_float(species.orbit_radius) \
			.override_failure_message("the shared resource was widened, so every other flock drifts too") \
			.is_equal(was)


func test_a_flock_with_no_player_raises_no_birds() -> void:
	var flock: Node3D = FlockScript.new()
	flock.species = _species()
	flock.count = 3
	add_child(flock)
	auto_free(flock)
	flock._ready()
	assert_int(flock.get_child_count()) \
			.override_failure_message("birds spawned with nothing to orbit") \
			.is_equal(0)
