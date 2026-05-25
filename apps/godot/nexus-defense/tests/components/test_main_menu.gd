extends GdUnitTestSuite

const MainMenu := preload("res://ui/components/main_menu.gd")

var _menu: Control

func before_test() -> void:
	var sb: Node = Engine.get_main_loop().root.get_node("/root/Supabase")
	if sb.has_method("clear_session"):
		sb.call("clear_session")
	_menu = auto_free(MainMenu.new())
	add_child(_menu)
	await await_idle_frame()

func test_builds_subtree() -> void:
	assert_int(_menu.get_child_count()).is_greater(0)
	assert_object(_menu.get("_title")).is_not_null()
	assert_object(_menu.get("_play_btn")).is_not_null()
	assert_object(_menu.get("_quit_btn")).is_not_null()

func test_anchors_full_rect_so_ui_can_fit_to_viewport() -> void:
	assert_float(_menu.anchor_right).is_equal_approx(1.0, 0.001)
	assert_float(_menu.anchor_bottom).is_equal_approx(1.0, 0.001)

func test_default_chip_shows_signed_out() -> void:
	var chip: Label = _menu.get("_user_chip")
	assert_str(chip.text).contains("Not signed in")

func test_set_signed_in_updates_chip_and_sign_in_button() -> void:
	_menu.call("set_signed_in", "h0lybyte")
	var chip: Label = _menu.get("_user_chip")
	var sign_in_btn: Control = _menu.get("_sign_in_btn")
	assert_str(chip.text).contains("h0lybyte")
	assert_str(String(sign_in_btn.text)).is_equal("Switch User")

func test_set_signed_out_resets_chip_and_sign_in_button() -> void:
	_menu.call("set_signed_in", "alice")
	_menu.call("set_signed_out")
	var chip: Label = _menu.get("_user_chip")
	var sign_in_btn: Control = _menu.get("_sign_in_btn")
	assert_str(chip.text).contains("Not signed in")
	assert_str(String(sign_in_btn.text)).is_equal("Sign In")

func test_set_status_writes_status_line() -> void:
	_menu.call("set_status", "hello world", "ok")
	var line: Label = _menu.get("_status_line")
	assert_str(line.text).is_equal("hello world")

func test_set_busy_disables_play_and_sign_in() -> void:
	_menu.call("set_busy", true)
	var play: Control = _menu.get("_play_btn")
	var sign_in: Control = _menu.get("_sign_in_btn")
	assert_bool(bool(play.call("is_disabled"))).is_true()
	assert_bool(bool(sign_in.call("is_disabled"))).is_true()
	_menu.call("set_busy", false)
	assert_bool(bool(play.call("is_disabled"))).is_false()

func test_play_button_emits_signal() -> void:
	var monitor: Variant = monitor_signals(_menu, false)
	var play: Control = _menu.get("_play_btn")
	var inner: Button = play.get("_button")
	inner.emit_signal("pressed")
	await assert_signal(monitor).is_emitted("play_pressed")

func test_quit_button_emits_signal() -> void:
	var monitor: Variant = monitor_signals(_menu, false)
	var quit: Control = _menu.get("_quit_btn")
	var inner: Button = quit.get("_button")
	inner.emit_signal("pressed")
	await assert_signal(monitor).is_emitted("quit_pressed")

func test_settings_button_emits_signal() -> void:
	var monitor: Variant = monitor_signals(_menu, false)
	var settings: Control = _menu.get("_settings_btn")
	var inner: Button = settings.get("_button")
	inner.emit_signal("pressed")
	await assert_signal(monitor).is_emitted("settings_pressed")

func test_apply_dict_routes_to_helpers() -> void:
	_menu.call("apply", {"title": "Custom Title", "subtitle": "Sub", "signed_in": true, "username": "kbve", "status": "ready", "status_kind": "ok"})
	assert_str(String((_menu.get("_title") as Label).text)).is_equal("Custom Title")
	assert_str(String((_menu.get("_subtitle") as Label).text)).is_equal("Sub")
	assert_str(String((_menu.get("_user_chip") as Label).text)).contains("kbve")
	assert_str(String((_menu.get("_status_line") as Label).text)).is_equal("ready")
