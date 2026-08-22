class_name LocaleTable
extends RefCounted

## One kbve.common.LocaleTable per database per language, loaded on demand.
##
## English is never a table: it stays in the canonical registry and is what a
## missing key falls back to, so a half-translated catalogue reads as English
## rather than as a raw key. Only the active language of each database is held.

static var _tables: Dictionary = {}


static func path_for(db: String, locale: String) -> String:
	return "res://assets/%s/%s.%s.json" % [db, db, locale]


static func read(db: String, locale: String) -> Dictionary:
	var out: Dictionary = {}
	if locale == "" or locale == "en":
		return out
	var path := path_for(db, locale)
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


static func entries(db: String) -> Dictionary:
	var locale := I18n.locale_code()
	var cached: Variant = _tables.get(db, null)
	if cached is Array and str((cached as Array)[0]) == locale:
		return (cached as Array)[1]
	var table := read(db, locale)
	_tables[db] = [locale, table]
	return table


## Translated text for "<ref>.<field path>" in `db`, or `fallback` when that
## database has nothing for this language.
static func t(db: String, key: String, fallback: String) -> String:
	var found: Variant = entries(db).get(key, "")
	return str(found) if str(found) != "" else fallback


static func forget(db := "") -> void:
	if db == "":
		_tables = {}
	else:
		_tables.erase(db)
