extends GdUnitTestSuite

const MAIN_SCENE := "res://scenes/main.tscn"

func _ui() -> Node:
	return Engine.get_main_loop().root.get_node("/root/Ui")

func after_test() -> void:
	var ui: Node = _ui()
	for panel_name in ["hud_top", "build_bar", "wave_banner", "pause", "boot"]:
		if ui.call("is_open", panel_name):
			ui.call("close", panel_name)
	await get_tree().create_timer(0.3).timeout

func test_main_scene_loads_and_opens_hud() -> void:
	var runner: GdUnitSceneRunner = scene_runner(MAIN_SCENE)
	await get_tree().create_timer(1.2).timeout
	assert_bool(_ui().call("is_open", "hud_top")).is_true()
	assert_bool(_ui().call("is_open", "build_bar")).is_true()
	runner.simulate_frames(2)

func test_skip_wave_advances_hud_state() -> void:
	var runner: GdUnitSceneRunner = scene_runner(MAIN_SCENE)
	await get_tree().create_timer(1.2).timeout
	var hud: Control = _ui().call("get_panel", "hud_top")
	var wave_before: int = int(hud.get("wave"))
	var gold_before: int = int(hud.get("gold"))
	runner.invoke("_advance_wave")
	await get_tree().create_timer(0.1).timeout
	hud = _ui().call("get_panel", "hud_top")
	assert_int(int(hud.get("wave"))).is_equal(wave_before + 1)
	assert_int(int(hud.get("gold"))).is_equal(gold_before + 50)

func test_pause_toggle_opens_pause_modal() -> void:
	var runner: GdUnitSceneRunner = scene_runner(MAIN_SCENE)
	await get_tree().create_timer(1.2).timeout
	_ui().call("toggle", "pause")
	await get_tree().create_timer(0.2).timeout
	assert_bool(_ui().call("is_open", "pause")).is_true()
	_ui().call("toggle", "pause")
	await get_tree().create_timer(0.3).timeout
	assert_bool(_ui().call("is_open", "pause")).is_false()
	runner.simulate_frames(2)
