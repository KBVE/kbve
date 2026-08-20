extends GdUnitTestSuite


const Locale := preload("res://src/dialogue/npcdb_locale.gd")
const Npcdb := preload("res://src/dialogue/npcdb_dialogue.gd")

var _saved := ""


func before_test() -> void:
	_saved = I18n.locale_code()
	I18n.set_locale("en")
	Locale.forget()


func after_test() -> void:
	I18n.set_locale(_saved)
	Locale.forget()


func test_the_catalogue_ships_a_table_for_every_offered_locale() -> void:
	for entry: Dictionary in I18n.locales():
		var code := str(entry["code"])
		if code == "en":
			continue
		assert_bool(FileAccess.file_exists(Locale.path_for(code))) \
				.override_failure_message(
						"npcdb has no table for %s -- the generator did not emit one" % code) \
				.is_true()


func test_an_npc_name_follows_the_locale() -> void:
	assert_str(Locale.t("aetherfang.name", "Aetherfang")).is_equal("Aetherfang")

	I18n.set_locale("ja")

	assert_str(Locale.t("aetherfang.name", "Aetherfang")).is_equal("エーテルファング")


func test_an_untranslated_key_reads_as_english_not_as_a_key() -> void:
	I18n.set_locale("ja")
	assert_str(Locale.t("aetherfang.nothing_here", "Teal over black")) \
			.override_failure_message("a missing translation must fall back, never surface a key") \
			.is_equal("Teal over black")


func test_a_translated_description_reaches_the_reader() -> void:
	I18n.set_locale("es")
	var text := Locale.t("aetherfang.description", "MISSING")
	assert_str(text).is_not_equal("MISSING")
	assert_str(text).contains("Verde azulado")


func test_the_speaker_of_a_graph_is_translated() -> void:
	I18n.set_locale("ja")
	var graph = Npcdb.graph("aetherfang")
	if graph == null or not graph.is_valid():
		return
	assert_str(graph.speaker).is_equal("エーテルファング")


func test_no_translation_leaked_into_the_canonical_registry() -> void:
	var body := FileAccess.get_file_as_string("res://assets/npcdb/npcdb.json")
	assert_str(body).override_failure_message(
			"an i18n block reached npcdb.json; it must be stripped before the registry is written") \
			.not_contains("\"i18n\"")
