extends GdUnitTestSuite


func before_test() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		return
	auth.store_path = "user://test_title_menu_session.cfg"
	auth.sign_out()


func _menu() -> TitleMenu:
	var menu := TitleMenu.new()
	add_child(menu)
	auto_free(menu)
	return menu


func test_it_offers_guest_play_first() -> void:
	var menu := _menu()
	assert_object(menu.play_button).is_not_null()
	assert_str(menu.play_button.text).is_equal(I18n.t("title.play_guest"))
	assert_bool(menu.play_button.disabled).is_false()


func test_language_row_is_on_the_title_itself() -> void:
	var menu := _menu()
	assert_int(menu.language_buttons.size()).is_equal(I18n.locales().size())
	var labels: Array = []
	for button: PaperButton in menu.language_buttons:
		labels.append(button.text)
	assert_array(labels).contains_exactly_in_any_order(I18n.locale_names())


func test_language_labels_do_not_change_with_the_locale() -> void:
	var before := I18n.locale_code()
	I18n.set_locale("ja")
	var menu := _menu()
	var labels: Array = []
	for button: PaperButton in menu.language_buttons:
		labels.append(button.text)
	assert_array(labels).contains_exactly_in_any_order(I18n.locale_names())
	assert_array(labels).contains(["English"])
	I18n.set_locale(before)


func test_choosing_a_language_asks_rather_than_switching_itself() -> void:
	var menu := _menu()
	var asked: Array = []
	menu.locale_requested.connect(func(code: String) -> void: asked.append(code))
	for button: PaperButton in menu.language_buttons:
		if not button.disabled:
			button.pressed.emit()
			break
	assert_int(asked.size()).is_equal(1)
	assert_str(asked[0]).is_not_equal(I18n.locale_code())


func test_the_current_language_is_not_offered_again() -> void:
	var menu := _menu()
	var disabled: Array = []
	for i in menu.language_buttons.size():
		if menu.language_buttons[i].disabled:
			disabled.append(I18n.locales()[i]["code"])
	assert_array(disabled).is_equal([I18n.locale_code()])


func test_sign_in_opens_a_form_rather_than_signing_anyone_in() -> void:
	var menu := _menu()
	assert_bool(menu.sign_in_button.disabled).is_false()
	assert_bool(menu.is_signing_in()).is_false()
	menu.sign_in_button.pressed.emit()
	assert_bool(menu.is_signing_in()).is_true()


func test_the_panel_reports_the_provider_that_was_chosen() -> void:
	var menu := _menu()
	var seen := []
	menu.sign_in_requested.connect(func(provider: String) -> void: seen.append(provider))
	menu.open_sign_in()
	menu._sign_in.provider_buttons["discord"].pressed.emit()
	assert_array(seen).is_equal(["discord"])


func test_every_offered_provider_can_actually_be_started() -> void:
	var menu := _menu()
	menu.open_sign_in()
	assert_array(menu._sign_in.provider_buttons.keys()).is_equal(AuthSession.PROVIDERS)


func test_a_sign_in_in_flight_ignores_further_presses() -> void:
	var menu := _menu()
	var seen := []
	menu.sign_in_requested.connect(func(provider: String) -> void: seen.append(provider))
	menu.open_sign_in()
	menu._sign_in.provider_buttons["discord"].pressed.emit()
	menu._sign_in.provider_buttons["github"].pressed.emit()
	assert_array(seen).is_equal(["discord"])


func test_a_failed_sign_in_keeps_the_panel_and_the_reason() -> void:
	var menu := _menu()
	menu.open_sign_in()
	menu.sign_in_failed("Invalid login credentials")
	assert_bool(menu.is_signing_in()).is_true()
	assert_str(menu._sign_in.message_label.text).is_equal("Invalid login credentials")


func test_closing_the_panel_puts_the_menu_back() -> void:
	var menu := _menu()
	menu.open_sign_in()
	assert_bool(menu._column.visible).is_false()
	menu.close_sign_in()
	assert_bool(menu.is_signing_in()).is_false()
	assert_bool(menu._column.visible).is_true()


func test_play_asks_rather_than_loading_the_world_itself() -> void:
	var menu := _menu()
	var asked := [0]
	menu.play_requested.connect(func() -> void: asked[0] += 1)
	menu.play_button.pressed.emit()
	assert_int(asked[0]).is_equal(1)


func test_the_two_play_paths_are_separate() -> void:
	var menu := _menu()
	var online := [0]
	var solo := [0]
	menu.play_requested.connect(func() -> void: online[0] += 1)
	menu.solo_requested.connect(func() -> void: solo[0] += 1)
	menu.solo_button.pressed.emit()
	assert_int(solo[0]).is_equal(1)
	assert_int(online[0]).is_equal(0)


func test_settings_and_quit_are_wired() -> void:
	var menu := _menu()
	var settings := [0]
	var quit := [0]
	menu.settings_requested.connect(func() -> void: settings[0] += 1)
	menu.quit_requested.connect(func() -> void: quit[0] += 1)
	menu.settings_button.pressed.emit()
	menu.quit_button.pressed.emit()
	assert_int(settings[0]).is_equal(1)
	assert_int(quit[0]).is_equal(1)


func test_escape_is_a_cancel_not_a_quit() -> void:
	var menu := _menu()
	var cancelled := [0]
	var quit := [0]
	menu.cancel_requested.connect(func() -> void: cancelled[0] += 1)
	menu.quit_requested.connect(func() -> void: quit[0] += 1)

	var escape := InputEventAction.new()
	escape.action = &"ui_cancel"
	escape.pressed = true
	menu._unhandled_input(escape)

	assert_int(cancelled[0]).is_equal(1)
	assert_int(quit[0]).is_equal(0)


func test_the_scenes_it_points_at_exist() -> void:
	assert_bool(ResourceLoader.exists(TitleMenu.WORLD_SCENE)).is_true()
	assert_bool(ResourceLoader.exists(TitleMenu.ONLINE_SCENE)).is_true()


func _token(claims: Dictionary) -> String:
	var payload := Marshalls.utf8_to_base64(JSON.stringify(claims))
	payload = payload.replace("+", "-").replace("/", "_").rstrip("=")
	return "header." + payload + ".signature"


func test_a_signed_in_player_is_offered_their_own_name() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		return
	var menu := _menu()
	auth.adopt_account(_token({"sub": "abc", "kbve_username": "h0lybyte"}), "", "refresh", 0)
	await await_idle_frame()
	assert_str(menu.play_button.text).is_equal(
			I18n.t("title.play_as_account", {"name": "h0lybyte"}))
	assert_str(menu.play_button.text).contains("h0lybyte")
	auth.sign_out()


func test_signing_out_returns_the_guest_label() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		return
	var menu := _menu()
	auth.adopt_account(_token({"sub": "abc", "kbve_username": "h0lybyte"}), "", "refresh", 0)
	await await_idle_frame()
	auth.sign_out()
	await await_idle_frame()
	assert_str(menu.play_button.text).is_equal(I18n.t("title.play_guest"))


func test_an_account_without_a_username_gets_the_plain_verb() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		return
	var menu := _menu()
	auth.adopt_account(_token({"sub": "abc"}), "", "refresh", 0)
	await await_idle_frame()
	assert_str(menu.play_button.text).is_equal(I18n.t("action.play"))
	assert_str(menu.play_button.text).not_contains("{{")
	auth.sign_out()


func test_every_locale_fills_the_name_in() -> void:
	var before := I18n.locale_code()
	for entry: Dictionary in I18n.locales():
		I18n.set_locale(str(entry.get("code", "en")))
		var text := I18n.t("title.play_as_account", {"name": "h0lybyte"})
		assert_str(text).override_failure_message(
				"%s drops the name" % I18n.locale_code()).contains("h0lybyte")
		assert_str(text).not_contains("{{")
	I18n.set_locale(before)


## A tooltip that resolves to its own key is worse than none, and the row is the first
## thing a new player reads.
func test_every_button_carries_a_translated_tooltip() -> void:
	var menu := _menu()
	var buttons: Array[PaperButton] = [menu.play_button, menu.solo_button,
			menu.sign_in_button, menu.settings_button, menu.quit_button]
	for button in buttons:
		assert_str(button.tooltip_text).override_failure_message(
				"%s has no tooltip" % button.text).is_not_empty()
		assert_str(button.tooltip_text).not_contains("tip.")
	for button in menu.language_buttons:
		assert_str(button.tooltip_text).is_not_empty()
		assert_str(button.tooltip_text).not_contains("tip.")


## The menu is sized against a 1280x720 design, so a phone viewport has to scale it up or
## it renders at roughly one device pixel per unit.
func test_the_menu_scales_up_for_a_taller_viewport() -> void:
	var menu := _menu()
	assert_float(menu.ui_scale()).is_greater(0.0)
	assert_float(menu.ui_scale()).is_less_equal(MenuStyle.SCALE_RANGE.y)
	assert_float(menu.ui_scale()).is_greater_equal(MenuStyle.SCALE_RANGE.x)


## Buttons must not run past the edge on a narrow screen, whatever the scale says.
func test_a_button_never_exceeds_the_viewport_width() -> void:
	var menu := _menu()
	var view := menu.get_viewport().get_visible_rect().size
	for button in [menu.play_button, menu.solo_button, menu.quit_button]:
		assert_float(button.custom_minimum_size.x).override_failure_message(
				"%s is wider than the screen" % button.text).is_less_equal(view.x)
