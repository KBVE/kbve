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
	assert_str(menu.play_button.text).contains("Guest")
	assert_bool(menu.play_button.disabled).is_false()


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


func test_the_world_scene_it_points_at_exists() -> void:
	assert_bool(ResourceLoader.exists(TitleMenu.WORLD_SCENE)).is_true()
