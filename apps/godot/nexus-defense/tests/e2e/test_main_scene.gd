extends GdUnitTestSuite

const MENU_SCENE := "res://scenes/main.tscn"

func _ui() -> Node:
	return Engine.get_main_loop().root.get_node("/root/Ui")

func _supabase() -> Node:
	return Engine.get_main_loop().root.get_node("/root/Supabase")

func before_test() -> void:
	_supabase().call("clear_session")

func after_test() -> void:
	var ui: Node = _ui()
	for panel_name in ["main_menu", "hud_top", "build_bar", "wave_banner", "pause", "boot"]:
		if ui.call("is_open", panel_name):
			ui.call("close", panel_name)
	await get_tree().create_timer(0.3).timeout
	_supabase().call("clear_session")

func test_menu_scene_opens_main_menu_panel() -> void:
	var runner: GdUnitSceneRunner = scene_runner(MENU_SCENE)
	await get_tree().create_timer(0.4).timeout
	assert_bool(_ui().call("is_open", "main_menu")).is_true()
	runner.simulate_frames(2)

func test_menu_shows_signed_out_by_default() -> void:
	var runner: GdUnitSceneRunner = scene_runner(MENU_SCENE)
	await get_tree().create_timer(0.4).timeout
	var menu: Control = _ui().call("get_panel", "main_menu")
	assert_object(menu).is_not_null()
	assert_str(String(menu.get("_user_chip").text)).contains("Not signed in")
	runner.simulate_frames(2)
