class_name NpcdbLocale
extends RefCounted

## Translations for the npc catalogue, generated from the i18n block of each MDX
## entry and shipped as one kbve.common.LocaleTable per language.
##
## English is not a table: it stays in npcdb.json itself and is what a missing key
## falls back to, so a half-translated catalogue reads as English rather than as a
## raw key. The active table is cached and dropped when the locale changes.

const DIR := "res://assets/npcdb"


static var _entries: Dictionary = {}
static var _loaded_locale := ""


static func path_for(locale: String) -> String:
	return "%s/npcdb.%s.json" % [DIR, locale]


static func _read(locale: String) -> Dictionary:
	var out: Dictionary = {}
	if locale == "" or locale == "en":
		return out
	var path := path_for(locale)
	var raw: Variant = null
	if ResourceLoader.exists(path):
		var res: Variant = ResourceLoader.load(path)
		if res is JSON:
			raw = (res as JSON).data
	if raw == null and FileAccess.file_exists(path):
		var json := JSON.new()
		if json.parse(FileAccess.get_file_as_string(path)) == OK:
			raw = json.data
	if raw is not Dictionary:
		return out
	var list: Variant = (raw as Dictionary).get("entries", [])
	if list is not Array:
		return out
	for entry: Variant in list:
		if entry is Dictionary and (entry as Dictionary).has("key"):
			out[str((entry as Dictionary)["key"])] = str((entry as Dictionary).get("value", ""))
	return out


static func _table() -> Dictionary:
	var locale := I18n.locale_code()
	if locale != _loaded_locale:
		_entries = _read(locale)
		_loaded_locale = locale
	return _entries


## Translated text for "<ref>.<field path>", or `fallback` when the catalogue has
## nothing for this language.
static func t(key: String, fallback: String) -> String:
	var found: Variant = _table().get(key, "")
	return str(found) if str(found) != "" else fallback


static func forget() -> void:
	_entries = {}
	_loaded_locale = ""
