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
	"api.not_signed_in",
	"api.request_failed",
	"api.no_answer",
	"api.session_expired",
	"api.http_error",
	"api.unreadable_balance",
]

const GFX := preload("res://src/settings/graphics_settings.gd")
const PLAY := preload("res://src/settings/gameplay_settings.gd")
const TitleMenu := preload("res://src/ui/title_menu.gd")


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


## The title is the one place the pixel face is used, so it is the one place a string
## has to fit the face rather than the face fitting the string.
##
## It was the project-wide fallback for a while, which left a hole wherever any string
## reached for a character it does not have -- the punctuation everywhere, and most of
## the vowels in Spanish and Portuguese. Scoped to the title that cannot happen again,
## unless the title itself is localised into something Alagard cannot spell.
func test_the_title_face_can_spell_the_title_in_every_locale() -> void:
	var face: Font = TitleMenu.TITLE_TYPEFACE
	var before := I18n.locale_code()
	for entry: Dictionary in I18n.locales():
		var code: String = entry["code"]
		I18n.set_locale(code)
		var title := I18n.t(TitleMenu.TITLE_KEY)
		assert_array(_uncovered_glyphs([title], face)).override_failure_message(
				"the %s title \"%s\" has characters the title face cannot draw: %s"
						% [code, title, ", ".join(_uncovered_glyphs([title], face))]
		).is_empty()
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


## English is the fallback, so a key missing from another locale never errors -- it
## quietly serves English. These two keep that silence from hiding a gap.
func _table(code: String) -> Dictionary:
	return I18n._read_locale(code)


func test_every_locale_carries_every_english_key() -> void:
	var english := _table("en")
	for entry: Dictionary in I18n.locales():
		var code := str(entry["code"])
		if code == "en":
			continue
		var missing: Array[String] = []
		for key: String in english:
			if not _table(code).has(key):
				missing.append(key)
		missing.sort()
		assert_array(missing).override_failure_message(
				"%s falls back to English for %d key(s): %s"
						% [code, missing.size(), ", ".join(missing)]).is_empty()


func test_no_translation_drops_a_placeholder() -> void:
	var english := _table("en")
	var re := RegEx.new()
	re.compile("\\{\\{?\\w+\\}?\\}")
	for entry: Dictionary in I18n.locales():
		var code := str(entry["code"])
		if code == "en":
			continue
		var table := _table(code)
		for key: String in english:
			if not table.has(key):
				continue
			assert_array(_slots(re, str(table[key]))).override_failure_message(
					"%s %s does not fill the same slots as English" % [code, key]) \
					.is_equal(_slots(re, str(english[key])))


func _slots(re: RegEx, text: String) -> Array[String]:
	var out: Array[String] = []
	for hit in re.search_all(text):
		out.append(hit.get_string())
	out.sort()
	return out


func test_a_locale_table_is_read_from_disk_once() -> void:
	var first := I18n._read_locale("es")
	var second := I18n._read_locale("es")
	assert_bool(is_same(first, second)).override_failure_message(
			"the Spanish table was parsed and flattened a second time").is_true()


func test_an_api_failure_is_not_left_in_english() -> void:
	var before := I18n.locale_code()
	I18n.set_locale("es")
	assert_str(I18n.t("api.session_expired")).is_not_equal("session expired")
	assert_str(I18n.t("api.http_error", {"code": 503})).contains("503")
	I18n.set_locale(before)
