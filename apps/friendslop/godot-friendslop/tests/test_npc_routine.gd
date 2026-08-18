extends GdUnitTestSuite

const Actor := preload("res://src/npc/npc_actor.gd")
const Npcdb := preload("res://src/dialogue/npcdb_dialogue.gd")
const WORLD := "res://scenes/main.tscn"
const HOUR_SECONDS := 112.5

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
			.override_failure_message("QRoutine is missing, so nobody has a day") \
			.is_true()


func test_a_day_puts_somebody_somewhere_at_every_hour() -> void:
	var day := QRoutine.create(HOUR_SECONDS)
	day.add_stop(Vector3(0.0, 0.0, 0.0), 8.0)
	day.add_stop(Vector3(0.0, 0.0, 20.0), 14.0)
	for step in 48:
		var hour := float(step) * 0.5
		assert_bool(day.at(hour).is_empty()) \
				.override_failure_message("nowhere to be at hour %.1f" % hour).is_false()


func test_the_same_hour_reads_the_same_on_two_machines() -> void:
	var mine := _plan()
	var theirs := _plan()
	for step in 96:
		var hour := float(step) * 0.25
		assert_vector(mine.at(hour)["at"]) \
				.override_failure_message("two machines disagreed at hour %.2f" % hour) \
				.is_equal(theirs.at(hour)["at"])


func test_arriving_late_lands_in_the_same_place_as_being_there_all_along() -> void:
	var joined_late := _plan()
	var here_all_day := _plan()
	for step in 200:
		here_all_day.at(float(step) * 0.1)
	assert_vector(joined_late.at(13.5)["at"]).is_equal(here_all_day.at(13.5)["at"])


func test_somebody_is_walking_after_they_set_off_and_standing_once_they_arrive() -> void:
	var day := _plan()
	assert_bool(day.at(12.0 + 1.0 / 60.0)["walking"]) \
			.override_failure_message("nobody set off").is_true()
	assert_bool(day.at(17.0)["walking"]) \
			.override_failure_message("still walking hours after arriving").is_false()


func test_every_authored_routine_keeps_people_out_of_the_river() -> void:
	var span: PackedFloat32Array = _terrain.bridge_span()
	var water: float = _terrain.water_level_at()
	var middle := _middle(span)
	var along := _along(span)

	var stands := _authored_stands()
	var walkers := 0
	for who: String in stands:
		var routine := _routine_of(stands[who][0])
		if routine.is_empty():
			continue
		walkers += 1
		for stop: Dictionary in routine.get("stops", []):
			var across: float = stands[who][1] + float(stop.get("offsetX", 0.0))
			var down: float = stands[who][2] + float(stop.get("offsetZ", 0.0))
			var raw: Vector3 = Actor.bridge_spot(span, across, down)
			var at: Vector3 = Actor.dry_spot(_terrain, raw, middle, along)
			var ground: float = _terrain.height_at(at.x, at.z)
			assert_float(ground) \
					.override_failure_message("%s walks into the river at hour %s: ground %.2f, water %.2f" % [
						who, stop.get("hour", 0.0), ground, water]) \
					.is_greater(water)

	assert_int(walkers) \
			.override_failure_message("nobody in the world scene has a routine to walk") \
			.is_greater(0)


func test_a_routine_is_read_from_the_npc_catalog_and_not_the_scene() -> void:
	var routine := _routine_of("marlow")
	assert_bool(routine.is_empty()) \
			.override_failure_message("marlow lost his day when it moved to the catalog") \
			.is_false()
	assert_int(routine.get("stops", []).size()).is_greater(1)


func test_stops_are_answered_in_the_order_of_the_clock() -> void:
	var day := QRoutine.create(HOUR_SECONDS)
	day.add_stop(Vector3(0.0, 0.0, 9.0), 18.0)
	day.add_stop(Vector3(0.0, 0.0, 0.0), 6.0)
	assert_int(day.at(7.0)["stop"]) \
			.override_failure_message("the evening stop was answered in the morning") \
			.is_equal(0)


func test_a_villager_tracks_the_clock_and_stops_for_a_conversation() -> void:
	var clock := _clock(10.0)
	var actor := _actor(clock)
	if actor == null:
		return
	for _i in 60:
		actor._physics_process(0.1)
	var morning := actor.global_position

	clock.hour = 13.0
	for _i in 60:
		actor._physics_process(0.1)
	assert_float(actor.global_position.distance_to(morning)) \
			.override_failure_message("the afternoon found them where the morning left them") \
			.is_greater(1.0)

	var listener := _listener(actor.global_position)
	actor.face(listener)
	var talking_at := actor.global_position
	clock.hour = 20.0
	for _i in 60:
		actor._physics_process(0.1)
	assert_vector(actor.global_position) \
			.override_failure_message("walked off mid-conversation").is_equal(talking_at)

	actor.rest()
	for _i in 60:
		actor._physics_process(0.1)
	assert_float(actor.global_position.distance_to(talking_at)) \
			.override_failure_message("never caught up with the day after the talk ended") \
			.is_greater(1.0)


func test_a_conversation_that_walks_off_does_not_strand_anybody() -> void:
	var clock := _clock(10.0)
	var actor := _actor(clock)
	if actor == null:
		return
	var listener := _listener(actor.global_position)
	actor.face(listener)
	actor._physics_process(0.1)
	listener.global_position = actor.global_position + Vector3(0.0, 0.0, 400.0)

	var was := actor.global_position
	clock.hour = 20.0
	for _i in 60:
		actor._physics_process(0.1)
	assert_float(actor.global_position.distance_to(was)) \
			.override_failure_message("left standing by a conversation that walked away") \
			.is_greater(1.0)


func _actor(clock: Node) -> Node3D:
	var actor: Node3D = Actor.new()
	actor.npc_ref = "marlow"
	actor.stand_under_bridge = false
	add_child(actor)
	auto_free(actor)
	actor.clock_path = actor.get_path_to(clock)
	actor._lay_route()
	if actor._routine == null:
		fail("marlow has no routine to walk")
		return null
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


func _listener(at: Vector3) -> Node3D:
	var node := Node3D.new()
	add_child(node)
	auto_free(node)
	node.global_position = at
	return node


func _plan() -> QRoutine:
	var day := QRoutine.create(HOUR_SECONDS)
	day.set_speed(1.0)
	day.add_stop(Vector3(0.0, 0.0, 0.0), 6.0)
	day.add_stop(Vector3(0.0, 0.0, 30.0), 12.0)
	return day


func _routine_of(who: String) -> Dictionary:
	var entry := Npcdb.npc(who)
	var raw: Variant = entry.get("routine", null)
	return raw if raw is Dictionary else {}


func _authored_stands() -> Dictionary:
	var text := FileAccess.get_file_as_string(WORLD)
	var out := {}
	var who := ""
	var ref := ""
	var stands := false
	var offset := 2.0
	var along := 9.0
	for line in text.split("\n"):
		if line.begins_with("[node name="):
			if stands and ref != "":
				out[who] = [ref, offset, along]
			who = line.get_slice("\"", 1)
			ref = ""
			stands = false
			offset = 2.0
			along = 9.0
		elif line.begins_with("npc_ref = "):
			ref = line.get_slice("\"", 1)
		elif line.begins_with("stand_under_bridge = true"):
			stands = true
		elif line.begins_with("bridge_offset = "):
			offset = float(line.get_slice("= ", 1))
		elif line.begins_with("bridge_along = "):
			along = float(line.get_slice("= ", 1))
	if stands and ref != "":
		out[who] = [ref, offset, along]
	return out


func _middle(span: PackedFloat32Array) -> Vector3:
	return (Vector3(span[0], 0.0, span[1]) + Vector3(span[2], 0.0, span[3])) * 0.5


func _along(span: PackedFloat32Array) -> Vector3:
	return (Vector3(span[2], 0.0, span[3]) - Vector3(span[0], 0.0, span[1])).normalized()
