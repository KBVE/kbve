extends GdUnitTestSuite

const Actor := preload("res://src/npc/npc_actor.gd")
const Npcdb := preload("res://src/dialogue/npcdb_dialogue.gd")
const Entries := preload("res://src/ui/codex_entries.gd")


func test_every_authored_task_is_a_clip_the_rigs_can_play() -> void:
	var clips := _library_clips()
	var tasks := 0
	for who in _walkers():
		for stop: Dictionary in _stops_of(who):
			var task := str(stop.get("task", ""))
			if task == "":
				continue
			tasks += 1
			var full := "UAL2/" + task if not task.contains("/") else task
			assert_bool(clips.has(full)) \
					.override_failure_message("%s is meant to perform '%s', which no library carries" % [
						who, full]) \
					.is_true()
	assert_int(tasks) \
			.override_failure_message("nobody has any work authored").is_greater(0)


func test_every_authored_yield_is_a_real_item() -> void:
	var yields := 0
	for who in _walkers():
		for stop: Dictionary in _stops_of(who):
			var item := str(stop.get("yieldItem", ""))
			if item == "":
				continue
			yields += 1
			assert_bool(Itemdb.has(StringName(item))) \
					.override_failure_message("%s produces '%s', which the itemdb has never heard of" % [
						who, item]) \
					.is_true()
			assert_float(float(stop.get("yieldMinutes", 0.0))) \
					.override_failure_message("%s yields '%s' with no work period" % [who, item]) \
					.is_greater(0.0)
	assert_int(yields) \
			.override_failure_message("nobody produces anything").is_greater(0)


func test_working_the_morning_produces_something_and_arriving_does_not() -> void:
	var ground := _floor()
	var clock := _clock(8.3)
	var actor := _wren(clock)

	for _i in 200:
		actor._physics_process(0.1)
	var settled := ground.items().size()

	clock.hour = 9.2
	for _i in 30:
		actor._physics_process(0.1)
	assert_int(ground.items().size()) \
			.override_failure_message("working the morning shift produced nothing") \
			.is_greater(settled)


func test_a_cold_join_does_not_dump_a_days_work_on_the_ground() -> void:
	var ground := _floor()
	var clock := _clock(11.5)
	var actor := _wren(clock)

	for _i in 30:
		actor._physics_process(0.1)
	assert_int(ground.items().size()) \
			.override_failure_message("joining late spilled the whole morning's work at once") \
			.is_equal(0)


func test_what_wren_produces_is_what_wren_is_authored_to_produce() -> void:
	var ground := _floor()
	var clock := _clock(8.3)
	var actor := _wren(clock)
	for _i in 200:
		actor._physics_process(0.1)
	clock.hour = 9.2
	for _i in 30:
		actor._physics_process(0.1)
	var items := ground.items()
	assert_int(items.size()).is_greater(0)
	assert_str(str(items[0].ref)) \
			.override_failure_message("the morning stop is authored to yield herb") \
			.is_equal("herb")


func _wren(clock: Node) -> Node3D:
	var actor: Node3D = Actor.new()
	actor.npc_ref = "wren"
	actor.stand_under_bridge = false
	add_child(actor)
	auto_free(actor)
	actor.clock_path = actor.get_path_to(clock)
	actor._lay_route()
	assert_object(actor._routine) \
			.override_failure_message("wren has no routine to work").is_not_null()
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


func _floor() -> GroundItems:
	var ground := GroundItems.new()
	add_child(ground)
	auto_free(ground)
	return ground


func _walkers() -> Array:
	var out := []
	for who in ["marlow", "wren", "tam", "sable", "merchant", "cleric", "knight", "mage"]:
		if not _stops_of(who).is_empty():
			out.append(who)
	return out


func _stops_of(who: String) -> Array:
	var entry := Npcdb.npc(who)
	var raw: Variant = entry.get("routine", null)
	if not (raw is Dictionary):
		return []
	var stops: Variant = raw.get("stops", null)
	return stops if stops is Array else []


func _library_clips() -> Dictionary:
	var out := {}
	for path in Entries.ANIMATIONS:
		var inst: Node = load(path).instantiate()
		var player: AnimationPlayer = _find_player(inst)
		if player:
			var key: String = path.get_file().get_basename()
			for lib_name in player.get_animation_library_list():
				for clip in player.get_animation_library(lib_name).get_animation_list():
					out["%s/%s" % [key, clip]] = key
		inst.free()
	return out


func _find_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_player(child)
		if found:
			return found
	return null
