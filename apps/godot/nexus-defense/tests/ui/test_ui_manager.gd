extends GdUnitTestSuite

func _ui() -> Node:
	return Engine.get_main_loop().root.get_node("/root/Ui")

func after_test() -> void:
	var ui: Node = _ui()
	for panel_name in ["hud_top", "build_bar", "wave_banner", "pause", "boot"]:
		if ui.call("is_open", panel_name):
			ui.call("close", panel_name)
	await get_tree().create_timer(0.3).timeout

func test_autoload_present() -> void:
	assert_object(_ui()).is_not_null()

func test_theme_built_on_ready() -> void:
	var theme: Theme = _ui().get("theme_ref")
	assert_object(theme).is_not_null()
	assert_object(theme).is_instanceof(Theme)

func test_layer_constants_unique_and_ordered() -> void:
	var ui := _ui()
	var hud: int = int(ui.get("LAYER_HUD"))
	var panel: int = int(ui.get("LAYER_PANEL"))
	var toast: int = int(ui.get("LAYER_TOAST"))
	var modal: int = int(ui.get("LAYER_MODAL"))
	assert_int(hud).is_less(panel)
	assert_int(panel).is_less(toast)
	assert_int(toast).is_less(modal)

func test_open_returns_control_instance() -> void:
	var inst: Control = _ui().call("open", "hud_top")
	assert_object(inst).is_not_null()
	assert_object(inst).is_instanceof(Control)
	await await_idle_frame()

func test_open_idempotent_same_name_returns_same_instance() -> void:
	var first: Control = _ui().call("open", "hud_top")
	var second: Control = _ui().call("open", "hud_top")
	assert_object(first).is_same(second)
	await await_idle_frame()

func test_close_removes_panel() -> void:
	_ui().call("open", "hud_top")
	await await_idle_frame()
	assert_bool(_ui().call("is_open", "hud_top")).is_true()
	_ui().call("close", "hud_top")
	await get_tree().create_timer(0.3).timeout
	assert_bool(_ui().call("is_open", "hud_top")).is_false()

func test_toggle_open_then_close() -> void:
	var first: Control = _ui().call("toggle", "hud_top")
	assert_object(first).is_not_null()
	await await_idle_frame()
	var second: Control = _ui().call("toggle", "hud_top")
	assert_object(second).is_null()
	await get_tree().create_timer(0.3).timeout
	assert_bool(_ui().call("is_open", "hud_top")).is_false()

func test_open_unknown_panel_returns_null() -> void:
	var inst: Variant = _ui().call("open", "no_such_panel")
	assert_object(inst).is_null()

func test_apply_passes_data_on_open() -> void:
	var hud: Control = _ui().call("open", "hud_top", {"wave": 7, "lives": 13, "gold": 999, "enemies": 22})
	await await_idle_frame()
	assert_int(int(hud.get("wave"))).is_equal(7)
	assert_int(int(hud.get("lives"))).is_equal(13)
	assert_int(int(hud.get("gold"))).is_equal(999)
	assert_int(int(hud.get("enemies_left"))).is_equal(22)

func test_apply_reapplies_data_when_open_called_again() -> void:
	_ui().call("open", "hud_top", {"gold": 50})
	await await_idle_frame()
	_ui().call("open", "hud_top", {"gold": 250})
	await await_idle_frame()
	var hud: Control = _ui().call("get_panel", "hud_top")
	assert_int(int(hud.get("gold"))).is_equal(250)

func test_opened_signal_fires() -> void:
	var ui := _ui()
	var monitor := monitor_signals(ui, false)
	ui.call("open", "hud_top")
	await await_idle_frame()
	await assert_signal(monitor).is_emitted("opened", ["hud_top"])

func test_toast_spawns_and_self_destructs() -> void:
	var ui := _ui()
	var stack: Array = ui.get("_toast_stack")
	var before: int = stack.size()
	ui.call("toast", "hello", 0.05, "info")
	await await_idle_frame()
	stack = ui.get("_toast_stack")
	assert_int(stack.size()).is_equal(before + 1)
	await get_tree().create_timer(0.6).timeout
	stack = ui.get("_toast_stack")
	assert_int(stack.size()).is_equal(before)
