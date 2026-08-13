extends GdUnitTestSuite

## The title's wiring, not its looks. Entering the world is a signal precisely
## so this can be checked without loading the world.


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


## The row is on the title rather than behind Settings because a player who
## cannot read the menu cannot navigate the menu to reach it.
func test_language_row_is_on_the_title_itself() -> void:
	var menu := _menu()
	assert_int(menu.language_buttons.size()).is_equal(I18n.locales().size())
	var labels: Array = []
	for button: PaperButton in menu.language_buttons:
		labels.append(button.text)
	assert_array(labels).contains_exactly_in_any_order(I18n.locale_names())


## Written in its own language, not the current one: the label is the only part
## of the screen a player who does not read the current language can use.
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


## The row doubles as the readout of which language is on, so the current one is
## shown unavailable rather than dropped from the list.
func test_the_current_language_is_not_offered_again() -> void:
	var menu := _menu()
	var disabled: Array = []
	for i in menu.language_buttons.size():
		if menu.language_buttons[i].disabled:
			disabled.append(I18n.locales()[i]["code"])
	assert_array(disabled).is_equal([I18n.locale_code()])


## The slot is real and the ecosystem behind it exists, so the button is shown
## and disabled rather than hidden — hiding it would misreport what is left.
func test_sign_in_is_present_but_disabled() -> void:
	var menu := _menu()
	assert_object(menu.sign_in_button).is_not_null()
	assert_bool(menu.sign_in_button.disabled).is_true()
	assert_str(menu.sign_in_button.tooltip_text).is_not_empty()


func test_play_asks_rather_than_loading_the_world_itself() -> void:
	var menu := _menu()
	var asked := [0]
	menu.play_requested.connect(func() -> void: asked[0] += 1)
	menu.play_button.pressed.emit()
	assert_int(asked[0]).is_equal(1)


## Two ways in, and they are not the same thing: guest play joins the dedicated
## server, singleplayer runs this machine's own sim.
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


## Escape is "back out of what is open", which is only "quit" when nothing is —
## so it gets its own signal and the title decides which one it meant.
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
