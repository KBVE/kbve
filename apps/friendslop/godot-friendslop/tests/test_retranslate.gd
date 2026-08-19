extends GdUnitTestSuite


const Page := preload("res://src/ui/components/menu_page.gd")
const Card := preload("res://src/ui/account_card.gd")
const Hud := preload("res://src/net/online_hud.gd")

var _saved := ""


func before_test() -> void:
	_saved = I18n.locale_code()
	I18n.set_locale("en")


func after_test() -> void:
	I18n.set_locale(_saved)


func _panel() -> Control:
	var panel := Control.new()
	panel.size = Vector2(1280.0, 720.0)
	add_child(panel)
	auto_free(panel)
	return panel


func test_a_page_button_follows_the_locale() -> void:
	var page: MenuPage = Page.make(MenuStyle.Side.LEFT, _panel())
	var button := page.add_button("action.quit", Callable())
	assert_str(button.text).is_equal("Quit")

	I18n.set_locale("es")
	page.retranslate()

	assert_str(button.text).is_equal("Salir")


func test_a_cycler_label_and_its_values_follow_the_locale() -> void:
	var page: MenuPage = Page.make(MenuStyle.Side.LEFT, _panel())
	var row := page.add_cycler("settings.preset",
			func() -> Array: return [I18n.t("action.back")],
			func() -> int: return 0,
			func(_i: int) -> void: pass,
			1)
	row.refresh()
	assert_str(row.scalables()[0].text).is_equal("Preset")
	assert_str(row.scalables()[1].text).is_equal("Back")

	I18n.set_locale("es")
	page.retranslate()

	assert_str(row.scalables()[0].text).is_equal("Preajuste")
	assert_str(row.scalables()[1].text).is_equal("Volver")


func test_a_page_hint_follows_the_locale() -> void:
	if MenuStyle.touch:
		return
	var page: MenuPage = Page.make(MenuStyle.Side.LEFT, _panel())
	var button := page.add_button("action.quit", Callable(), "action.back")
	assert_str(button.tooltip_text).is_equal("Back")

	I18n.set_locale("es")
	page.retranslate()

	assert_str(button.tooltip_text).is_equal("Volver")


func test_a_read_balance_survives_a_locale_change() -> void:
	var card: AccountCard = Card.new()
	add_child(card)
	auto_free(card)
	card.show_account("holy")
	card.show_wallet(1500, 20)
	assert_str(card.wallet_label.text).contains("credits")

	I18n.set_locale("es")
	card.retranslate()

	assert_str(card.wallet_label.text).contains("créditos")
	assert_str(card.wallet_label.text) \
			.override_failure_message("a locale change threw the balance away and asked for it again") \
			.not_contains(I18n.t("account.loading"))


func test_a_nameless_card_keeps_falling_back_after_a_locale_change() -> void:
	var card: AccountCard = Card.new()
	add_child(card)
	auto_free(card)
	card.show_account("")
	assert_str(card.name_label.text).is_equal("signed in")

	I18n.set_locale("es")
	card.retranslate()

	assert_str(card.name_label.text).is_equal("sesión iniciada")


func test_a_failed_balance_is_not_relabelled_as_loading() -> void:
	var card: AccountCard = Card.new()
	add_child(card)
	auto_free(card)
	card.show_account("holy")
	card.show_wallet_error("session expired")

	I18n.set_locale("es")
	card.retranslate()

	assert_str(card.wallet_label.text).is_equal("session expired")


func test_the_online_hud_restates_its_status_in_the_new_locale() -> void:
	var hud: OnlineHud = Hud.new()
	add_child(hud)
	auto_free(hud)
	hud.set_joined("holy")
	assert_str(hud.status_label.text).is_equal("Joined as holy")

	I18n.set_locale("es")

	assert_str(hud.status_label.text).is_equal("Conectado como holy")


func test_an_unvisited_hud_line_stays_blank_through_a_locale_change() -> void:
	var hud: OnlineHud = Hud.new()
	add_child(hud)
	auto_free(hud)

	I18n.set_locale("es")

	assert_str(hud.pets_label.text).is_empty()
	assert_str(hud.roster_label.text).is_empty()
	assert_str(hud.status_label.text).is_empty()


func test_no_screen_reloads_itself_to_change_language() -> void:
	var offenders: Array[String] = []
	for path in _scripts("res://src"):
		var body := FileAccess.get_file_as_string(path)
		if body.contains("reload_current_scene"):
			offenders.append(path)
	assert_array(offenders) \
			.override_failure_message("reload_current_scene is back: a locale change must retranslate, not rebuild the world") \
			.is_empty()


func _scripts(root: String) -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(root)
	if dir == null:
		return out
	for name in dir.get_directories():
		out.append_array(_scripts("%s/%s" % [root, name]))
	for name in dir.get_files():
		if name.ends_with(".gd"):
			out.append("%s/%s" % [root, name])
	return out


func test_the_title_menu_restates_itself_in_the_new_locale() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth:
		auth.store_path = "user://test_retranslate_session.cfg"
		auth.sign_out()
	var menu := TitleMenu.new()
	add_child(menu)
	auto_free(menu)
	assert_str(menu.solo_button.text).is_equal("Singleplayer")
	assert_str(menu.quit_button.text).is_equal("Quit")

	I18n.set_locale("es")

	assert_str(menu.solo_button.text).is_equal("Un jugador")
	assert_str(menu.quit_button.text).is_equal("Salir")
	assert_str(menu.settings_button.text).is_equal("Ajustes")


func test_the_title_language_row_marks_the_live_locale() -> void:
	var menu := TitleMenu.new()
	add_child(menu)
	auto_free(menu)
	var codes: Array = []
	for entry: Dictionary in I18n.locales():
		codes.append(str(entry["code"]))

	I18n.set_locale("es")

	for i in menu.language_buttons.size():
		assert_bool(menu.language_buttons[i].disabled) \
				.override_failure_message("%s is the wrong button to disable while Spanish is live" % codes[i]) \
				.is_equal(codes[i] == "es")
