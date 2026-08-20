extends GdUnitTestSuite


func test_reporting_survives_without_the_extension() -> void:
	Telemetry.report("probe", "nothing should explode")
	Telemetry.report_unhandled("probe", "nor here")
	Telemetry.set_scene("res://scenes/title.tscn")
	assert_str(Telemetry.current_scene()).is_equal("res://scenes/title.tscn")


func test_a_report_is_observable() -> void:
	var seen: Array[String] = []
	var sink := func(kind: String, _message: String) -> void: seen.append(kind)
	Telemetry.reported.connect(sink)
	Telemetry.report("probe", "hello")
	Telemetry.report_unhandled("probe_unhandled", "hello")
	Telemetry.reported.disconnect(sink)
	assert_array(seen).contains(["probe", "probe_unhandled"])


## The pipe was wired at one end for a long time: the autoload stood up a manager
## and no caller ever reached it, so nothing a player hit was ever reported.
func test_the_failures_worth_seeing_are_reported() -> void:
	var wired := {
		"src/ui/loading_screen.gd": "scene_load",
		"src/characters/creature_rig.gd": "rig_missing",
		"src/autoload/auth_session.gd": "auth",
		"src/net/online_world.gd": "session_rejected",
		"src/player/player.gd": "fell_through_world",
		"src/ui/chat_panel.gd": "chat",
	}
	var missing: Array[String] = []
	for path: String in wired:
		var source := FileAccess.get_file_as_string("res://" + path)
		if not source.contains('Telemetry.') or not source.contains(wired[path]):
			missing.append(path)
	assert_array(missing).override_failure_message(
			"these report nothing a dashboard would ever see: %s" % str(missing)).is_empty()


## Reports are filtered by scene, so a swap that does not name its scene files the
## next failure under whichever scene the player left.
func test_a_scene_swap_names_the_scene() -> void:
	var source := FileAccess.get_file_as_string("res://src/ui/loading_screen.gd")
	assert_str(source).override_failure_message(
			"LoadingScreen.swap never tells Telemetry which scene it is").contains(
			"Telemetry.set_scene(path)")
