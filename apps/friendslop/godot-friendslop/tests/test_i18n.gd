extends GdUnitTestSuite


const KEYS := [
	"action.play",
	"action.back",
	"action.quit",
	"action.settings",
	"toggle.off",
	"toggle.on",
	"title.name",
	"title.play_guest",
	"title.singleplayer",
	"title.sign_in",
	"title.sign_in_hint",
	"title.guest_status",
	"pause.log_off",
	"settings.graphics",
	"settings.gameplay",
	"settings.codex",
	"settings.language",
	"settings.preset",
	"settings.quality",
	"settings.ground_detail",
	"settings.resolution",
	"settings.shadows",
	"settings.grass",
	"settings.post_fx",
	"settings.camera",
	"settings.crosshair",
]

const GFX := preload("res://src/settings/graphics_settings.gd")
const PLAY := preload("res://src/settings/gameplay_settings.gd")


func test_every_key_resolves() -> void:
	for key: String in KEYS:
		assert_str(I18n.t(key)).is_not_equal(key)


func test_settings_option_keys_resolve() -> void:
	for key: String in GFX.PRESET_NAMES + GFX.DETAIL_NAMES + PLAY.CAMERA_NAMES:
		assert_str(I18n.t(key)).is_not_equal(key)


func test_interpolation_fills_every_placeholder() -> void:
	var text := I18n.t("hud.roster", {"count": 2, "names": "ana, bo"})
	assert_str(text).contains("2")
	assert_str(text).contains("ana, bo")
	assert_str(text).not_contains("{{")


func test_unknown_key_returns_the_key() -> void:
	assert_str(I18n.t("nope.not.here")).is_equal("nope.not.here")


func test_every_locale_has_glyphs_for_its_own_strings() -> void:
	var before := I18n.locale_code()
	for entry: Dictionary in I18n.locales():
		var code: String = entry["code"]
		I18n.set_locale(code)
		var missing := _uncovered_glyphs(I18n.strings(), ThemeDB.fallback_font)
		assert_array(missing).override_failure_message(
				"%s has no glyph for: %s" % [code, ", ".join(missing)]).is_empty()
	I18n.set_locale(before)


func test_language_names_draw_while_the_picker_is_open() -> void:
	var before := I18n.locale_code()
	var names := "".join(I18n.locale_names())
	for entry: Dictionary in I18n.locales():
		I18n.set_locale(entry["code"])
		I18n.use_all_fonts()
		var missing := _uncovered_glyphs([names], ThemeDB.fallback_font)
		assert_array(missing).override_failure_message(
				"the picker is unreadable in %s, missing: %s" % [entry["code"], ", ".join(missing)]).is_empty()
	I18n.set_locale(before)
	I18n.use_locale_font()


func test_closing_the_picker_drops_back_to_one_font() -> void:
	I18n.set_locale("en")
	I18n.use_all_fonts()
	assert_int(ThemeDB.fallback_font.fallbacks.size()).is_greater(1)
	I18n.use_locale_font()
	assert_array(ThemeDB.fallback_font.fallbacks).is_empty()


func _uncovered_glyphs(texts: Array, font: Font) -> Array:
	var missing: Array = []
	for text: String in texts:
		for i in text.length():
			var c := text.unicode_at(i)
			if c <= 32 or missing.has(String.chr(c)):
				continue
			if not _chain_has(font, c):
				missing.append(String.chr(c))
	return missing


func _chain_has(font: Font, c: int) -> bool:
	if font.has_char(c):
		return true
	for fallback: Font in font.fallbacks:
		if fallback != null and _chain_has(fallback, c):
			return true
	return false


func test_offered_locales_have_tables_on_disk() -> void:
	assert_int(I18n.locales().size()).is_greater(0)
	for entry: Dictionary in I18n.locales():
		assert_bool(DirAccess.dir_exists_absolute("%s/%s" % [I18n.DIR, entry["code"]])).is_true()
	assert_int(I18n.locale_names().size()).is_equal(I18n.locales().size())
