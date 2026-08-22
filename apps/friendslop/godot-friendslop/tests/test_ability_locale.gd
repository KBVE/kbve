extends GdUnitTestSuite


const Ability := preload("res://src/dialogue/ability_locale.gd")
const Npcdb := preload("res://src/dialogue/npcdb_dialogue.gd")
const Table := preload("res://src/dialogue/locale_table.gd")

var _saved := ""


func before_test() -> void:
	_saved = I18n.locale_code()
	I18n.set_locale("en")
	Table.forget()


func after_test() -> void:
	I18n.set_locale(_saved)
	Table.forget()


func test_a_shared_ability_is_translated_once_for_every_creature_that_uses_it() -> void:
	assert_str(Ability.t("tackle.name", "Tackle")).is_equal("Tackle")

	I18n.set_locale("es")
	assert_str(Ability.t("tackle.name", "Tackle")).is_equal("Placaje")

	I18n.set_locale("ja")
	assert_str(Ability.t("tackle.name", "Tackle")).is_equal("たいあたり")


func test_a_shared_description_is_translated_too() -> void:
	I18n.set_locale("es")
	assert_str(Ability.t("howl.description", "MISSING")) \
			.contains("aullido")


func test_an_unshared_ability_reads_as_english_not_as_a_key() -> void:
	I18n.set_locale("es")
	assert_str(Ability.t("warp-claw.name", "Warp Claw")) \
			.override_failure_message(
					"an ability with no shared entry must fall back, never surface a key") \
			.is_equal("Warp Claw")


func test_an_npc_reads_the_shared_text_without_authoring_it() -> void:
	I18n.set_locale("es")
	var found := _ability(Npcdb.abilities("aetherfang"), "tackle")
	assert_dict(found).is_not_empty()
	assert_str(str(found["name"])).is_equal("Placaje")
	assert_str(str(found["description"])).contains("embestida")


func test_an_npc_that_wants_its_own_wording_beats_the_shared_table() -> void:
	I18n.set_locale("es")
	assert_str(Ability.t("bite.name", "Bite")).is_equal("Mordisco")

	var found := _ability(Npcdb.abilities("aetherfang"), "bite")
	assert_str(str(found["name"])) \
			.override_failure_message(
					"an npc's own translation must win over the shared one") \
			.is_equal("Colmillo Etéreo")


func test_an_npc_override_does_not_leak_onto_the_creatures_that_share_the_ability() -> void:
	I18n.set_locale("es")
	var wolf := ""
	for entry: Variant in Npcdb.registry().get("npcs", []):
		var npc: Dictionary = entry
		if str(npc.get("ref", "")) == "aetherfang":
			continue
		if not _ability(Ability.resolve(npc), "bite").is_empty():
			wolf = str(npc.get("ref", ""))
			break
	assert_str(wolf).is_not_empty()
	assert_str(str(_ability(Npcdb.abilities(wolf), "bite")["name"])) \
			.is_equal("Mordisco")


func test_an_untranslated_field_of_a_shared_ability_stays_english() -> void:
	I18n.set_locale("es")
	var found := _ability(Npcdb.abilities("aetherfang"), "warp-claw")
	assert_str(str(found["name"])) \
			.override_failure_message(
					"an ability nobody shares must keep its English name, not blank out") \
			.is_equal("Warp Claw")


func test_no_translation_leaked_into_the_canonical_registry() -> void:
	var body := FileAccess.get_file_as_string("res://assets/npcdb/npcdb.json")
	assert_str(body).override_failure_message(
			"an i18n block reached npcdb.json; it must be stripped before the registry is written") \
			.not_contains("\"i18n\"")


## The guard that keeps a half-finished language from shipping.
##
## Scope is per entry and per field: an entry constrains only the languages it
## already declares, and only the fields someone has already started translating in
## one of them. ~90 of the 93 npcs carry no translations at all and are therefore
## outside it entirely -- a blanket "every key in every language" rule would fail on
## roughly 1,100 keys today and would be switched off within a week.
func test_a_field_translated_in_one_language_is_translated_in_all_of_that_entrys_languages() -> void:
	for db: String in ["npcdb", "abilitydb"]:
		var by_ref := {}
		for entry: Variant in I18n.locales():
			var code := str((entry as Dictionary)["code"])
			if code == "en":
				continue
			var path := Table.path_for(db, code)
			if not FileAccess.file_exists(path):
				continue
			for key: String in Table.read(db, code).keys():
				var at := key.find(".")
				if at <= 0:
					continue
				var ref := key.substr(0, at)
				var field := key.substr(at + 1)
				if not by_ref.has(ref):
					by_ref[ref] = {}
				if not by_ref[ref].has(code):
					by_ref[ref][code] = {}
				by_ref[ref][code][field] = true

		for ref: String in by_ref:
			var codes: Array = by_ref[ref].keys()
			var in_scope := {}
			for code: String in codes:
				in_scope.merge(by_ref[ref][code])
			for code: String in codes:
				var missing: Array = []
				for field: String in in_scope:
					if not by_ref[ref][code].has(field):
						missing.append(field)
				assert_array(missing).override_failure_message(
						"%s/%s translates %s into %s but not into %s -- %s would read half in one language" % [
							db, ref, str(missing), str(codes), code, ref]) \
						.is_empty()


func _ability(list: Array, id: String) -> Dictionary:
	for entry: Variant in list:
		if entry is Dictionary and str((entry as Dictionary).get("id", "")) == id:
			return entry
	return {}
