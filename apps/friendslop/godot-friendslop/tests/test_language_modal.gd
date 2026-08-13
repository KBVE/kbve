extends GdUnitTestSuite

## The first-run picker, and the rule that decides whether it appears.

const CONFIG_PATH := "user://gameplay.cfg"

var _saved: Variant = null


func before_test() -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	_saved = cfg.get_value("gameplay", "locale", null) if cfg.has_section_key("gameplay", "locale") else null


## The suite writes to the same file the game does, so the machine it runs on keeps
## whatever it had -- and the locale is a live global, so the running autoload is put
## back too.
func after_test() -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	if _saved == null:
		cfg.erase_section_key("gameplay", "locale")
	else:
		cfg.set_value("gameplay", "locale", _saved)
	cfg.save(CONFIG_PATH)
	I18n.set_locale(str(_saved) if _saved != null else I18n.system_locale())


func _clear_choice() -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.erase_section_key("gameplay", "locale")
	cfg.save(CONFIG_PATH)


func _modal() -> LanguageModal:
	var modal := LanguageModal.new()
	add_child(modal)
	auto_free(modal)
	return modal


## Booting in the device's language is a guess.
func test_a_guessed_locale_is_not_a_choice() -> void:
	_clear_choice()
	I18n.set_locale("es")
	assert_bool(I18n.has_choice()).is_false()


func test_choosing_is_remembered() -> void:
	_clear_choice()
	I18n.set_locale("es", true)
	assert_bool(I18n.has_choice()).is_true()
	assert_str(I18n.saved_locale()).is_equal("es")


func test_it_offers_every_locale_in_its_own_script() -> void:
	var modal := _modal()
	var labels: Array = []
	for button: PaperButton in modal.buttons:
		labels.append(button.text)
	assert_array(labels).contains_exactly_in_any_order(I18n.locale_names())


## Tapping a language has to be the end of the question: an answer that is not written
## down brings the modal back on the next launch.
func test_tapping_a_language_saves_it() -> void:
	_clear_choice()
	var modal := _modal()
	var picked: Array = []
	modal.chosen.connect(func(code: String) -> void: picked.append(code))

	var index := I18n.locale_names().find("日本語")
	modal.buttons[index].pressed.emit()

	assert_array(picked).is_equal(["ja"])
	assert_bool(I18n.has_choice()).is_true()
	assert_str(I18n.saved_locale()).is_equal("ja")
	assert_str(I18n.locale_code()).is_equal("ja")


## Every button is a different script, so the modal is the one screen that has to have
## them all loaded before it draws.
func test_its_own_labels_are_drawable() -> void:
	var modal := _modal()
	var font := ThemeDB.fallback_font
	for button: PaperButton in modal.buttons:
		for i in button.text.length():
			var c := button.text.unicode_at(i)
			if c <= 32:
				continue
			assert_bool(_chain_has(font, c)).override_failure_message(
					"no glyph for %s in %s" % [String.chr(c), button.text]).is_true()


func _chain_has(font: Font, c: int) -> bool:
	if font.has_char(c):
		return true
	for fallback: Font in font.fallbacks:
		if fallback != null and _chain_has(fallback, c):
			return true
	return false
