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


func test_a_dialogue_line_is_translated_inside_a_real_graph() -> void:
	I18n.set_locale("es")
	var graph = Npcdb.graph("cleric")
	assert_bool(graph.is_valid()).is_true()
	assert_str(graph.speaker).is_equal("Clériga")
	assert_str(str(graph.node("greet").get("line"))).contains("Siéntate")


func test_a_choice_label_is_translated_by_its_id_not_its_position() -> void:
	I18n.set_locale("ja")
	var graph = Npcdb.graph("cleric")
	var choices: Array = graph.node("menu").get("choices", [])
	var labels: Array = []
	for choice: Dictionary in choices:
		labels.append(str(choice.get("text", "")))
	assert_array(labels).contains(["なぜ渡し場に留まっている？"])


func test_an_untranslated_line_in_a_translated_graph_stays_english() -> void:
	I18n.set_locale("es")
	var graph = Npcdb.graph("cleric")
	var here := str(graph.node("here").get("line", ""))
	assert_str(here).override_failure_message(
			"a node with no translation must keep its English line, not blank out") \
			.is_not_empty()
