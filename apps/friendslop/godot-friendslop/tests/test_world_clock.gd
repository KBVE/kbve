extends GdUnitTestSuite

## Guards the sky against the clock the host actually keeps.
##
## The host sends elapsed seconds and both sides turn those into an hour. If the two
## mappings ever drift apart nothing errors — everyone stands in the same world under a
## slightly different sun, which is the failure this clock exists to stop.

const DayNight := preload("res://src/world/day_night.gd")

const DAY_MINUTES := 45.0
const START_HOUR := 9.0


func _sky() -> Node3D:
	var node: Node3D = DayNight.new()
	node.day_length_minutes = DAY_MINUTES
	node.start_hour = START_HOUR
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	node.add_child(sun)
	var moon := DirectionalLight3D.new()
	moon.name = "Moon"
	node.add_child(moon)
	add_child(node)
	return node


## Spelled out rather than called, so this compares two independent statements of the
## mapping instead of taking one of them on trust.
func _hour_at(elapsed: float) -> float:
	return fposmod(START_HOUR + elapsed * 24.0 / (DAY_MINUTES * 60.0), 24.0)


func test_a_driven_sky_reads_the_hour_the_host_would() -> void:
	var sky := _sky()
	for elapsed in [0.0, 337.5, 1350.0, 2700.0, 4050.0, 9999.0]:
		assert_float(sky.hour_for(elapsed)) \
			.override_failure_message("at %ss the sky reads %s, the host reads %s" \
					% [elapsed, sky.hour_for(elapsed), _hour_at(elapsed)]) \
			.is_equal_approx(_hour_at(elapsed), 0.01)
	sky.queue_free()


## A mapping that quietly lost its wrap still passes everything inside the first day.
func test_the_sky_turns_over_at_midnight() -> void:
	var sky := _sky()
	assert_float(sky.hour_for(DAY_MINUTES * 60.0 * 0.625)).is_equal_approx(0.0, 0.01)
	assert_float(sky.hour_for(DAY_MINUTES * 60.0)) \
		.override_failure_message("a whole day did not come back to the start hour") \
		.is_equal_approx(START_HOUR, 0.01)
	assert_float(sky.hour_for(DAY_MINUTES * 60.0 * 4.0)) \
		.override_failure_message("four days did not either") \
		.is_equal_approx(START_HOUR, 0.01)
	sky.queue_free()


## Singleplayer has no host to take the time from, so the same node has to still be its
## own clock rather than sitting wherever it was last told.
func test_a_sky_is_its_own_clock_until_a_host_takes_it_over() -> void:
	var sky := _sky()
	assert_bool(sky.is_driven()) \
		.override_failure_message("a sky with no session behind it thinks it is driven") \
		.is_false()
	sky.set_world_time(1350.0)
	assert_bool(sky.is_driven()).is_true()
	sky.queue_free()
