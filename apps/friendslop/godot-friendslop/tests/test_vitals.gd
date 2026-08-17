extends GdUnitTestSuite

## The bridge between the world and the body simulation.
##
## What the numbers do is the `q` crate's own business and is tested there. What is tested
## here is that the two ends are connected: what Godot asks for arrives, and what the
## simulation decides comes back.

## A tick is 50ms. Ten of them is a fifth of a second, which is long enough for a command
## to land and short enough that a broken bridge fails the suite rather than hanging it.
const PATIENCE := 60
const FRAME := 0.02

const SOMEBODY := 4242


func after_test() -> void:
	Vitals.retire(SOMEBODY)


## The sim answers a tick late by construction, so everything here waits for it rather than
## reading straight after writing.
func _until(test: Callable) -> bool:
	for _i in PATIENCE:
		if test.call():
			return true
		await get_tree().create_timer(FRAME).timeout
	return test.call()


func test_the_simulation_is_running() -> void:
	assert_bool(Vitals.running()) \
			.override_failure_message("no simulation, so nothing in the world has a body") \
			.is_true()


func test_somebody_enlisted_turns_up_with_a_body() -> void:
	Vitals.enlist(SOMEBODY, 5, 3, 2)
	assert_bool(await _until(func() -> bool: return Vitals.knows(SOMEBODY))) \
			.override_failure_message("the simulation never reported somebody it was told about") \
			.is_true()

	assert_float(Vitals.maximum(SOMEBODY, Vitals.Pool.HEALTH)) \
			.override_failure_message("health does not follow strength") \
			.is_greater(Vitals.maximum(SOMEBODY, Vitals.Pool.MANA))
	assert_float(Vitals.fraction(SOMEBODY, Vitals.Pool.HEALTH)).is_equal_approx(1.0, 0.01)


## Somebody the simulation has never heard of reads as empty rather than as a broken
## number, so a bar drawn from them is a bar rather than a NaN.
func test_a_stranger_reads_as_empty_rather_than_broken() -> void:
	assert_bool(Vitals.knows(-99)).is_false()
	assert_float(Vitals.fraction(-99, Vitals.Pool.HEALTH)).is_equal(0.0)
	assert_float(Vitals.maximum(-99, Vitals.Pool.ENERGY)).is_equal(0.0)
	assert_bool(Vitals.is_down(-99)).is_false()


func test_what_is_spent_is_gone() -> void:
	Vitals.enlist(SOMEBODY, 3, 3, 3)
	await _until(func() -> bool: return Vitals.knows(SOMEBODY))
	var full := Vitals.current(SOMEBODY, Vitals.Pool.ENERGY)

	Vitals.drain(SOMEBODY, Vitals.Pool.ENERGY, 20.0)
	assert_bool(await _until(func() -> bool:
			return Vitals.current(SOMEBODY, Vitals.Pool.ENERGY) < full)) \
			.override_failure_message("the spend never reached the simulation").is_true()


## Running out of health is news, once.
func test_running_out_is_announced() -> void:
	Vitals.enlist(SOMEBODY, 1, 1, 1)
	await _until(func() -> bool: return Vitals.knows(SOMEBODY))

	var heard: Array = []
	var listener := func(id: int) -> void: heard.append(id)
	Vitals.downed.connect(listener)
	Vitals.damage(SOMEBODY, 10_000.0)

	assert_bool(await _until(func() -> bool: return heard.size() > 0)) \
			.override_failure_message("nobody was told the character had gone down").is_true()
	assert_bool(Vitals.is_down(SOMEBODY)).is_true()

	## Nothing else happens to them, so nothing else should be said about them.
	await get_tree().create_timer(0.15).timeout
	assert_int(heard.size()) \
			.override_failure_message("the same news arrived more than once").is_equal(1)
	Vitals.downed.disconnect(listener)


## The player has a body from the moment they are in the world. Staged rather than assumed,
## because the enlisting is a line in the player's own `_ready` and a test that only reads
## the simulation would pass with that line deleted.
func test_the_player_has_a_body() -> void:
	Vitals.retire(Vitals.PLAYER)
	var was := get_tree().current_scene
	var world := Node3D.new()
	world.name = "StandInWorld"
	get_tree().root.add_child(world)
	get_tree().current_scene = world

	var player: Node = load("res://scenes/player.tscn").instantiate()
	world.add_child(player)

	assert_bool(await _until(func() -> bool: return Vitals.knows(Vitals.PLAYER))) \
			.override_failure_message("the player was never enlisted").is_true()
	assert_float(Vitals.maximum(Vitals.PLAYER, Vitals.Pool.HEALTH)).is_greater(0.0)

	await get_tree().process_frame
	get_tree().current_scene = was
	get_tree().root.remove_child(world)
	world.free()


## Everybody at the crossing is somebody in the simulation, and the same person across a
## reload rather than whoever happened to be spawned first.
func test_a_name_in_the_catalog_is_always_the_same_body() -> void:
	assert_int(Vitals.id_for("marlow")).is_equal(Vitals.id_for("marlow"))
	assert_int(Vitals.id_for("marlow")).is_not_equal(Vitals.id_for("wren"))
	assert_int(Vitals.id_for("")) \
			.override_failure_message("a nameless actor was given a body anyway").is_equal(0)


## Experience is a thing quests pay in, so it has to arrive.
func test_experience_arrives() -> void:
	Vitals.enlist(SOMEBODY, 2, 2, 2)
	await _until(func() -> bool: return Vitals.knows(SOMEBODY))

	Vitals.award(SOMEBODY, 120)
	assert_bool(await _until(func() -> bool: return Vitals.experience(SOMEBODY) >= 120)) \
			.override_failure_message("the experience never landed").is_true()

	var cost := Vitals.next_cost(SOMEBODY, Vitals.Attribute.STRENGTH)
	assert_int(cost).is_greater(0)
	var before := Vitals.rank(SOMEBODY, Vitals.Attribute.STRENGTH)
	Vitals.invest(SOMEBODY, Vitals.Attribute.STRENGTH)
	assert_bool(await _until(func() -> bool:
			return Vitals.rank(SOMEBODY, Vitals.Attribute.STRENGTH) > before)) \
			.override_failure_message("the experience bought nothing").is_true()
	assert_int(Vitals.experience(SOMEBODY)).is_equal(120 - cost)
