extends Node

## Every player-facing string, keyed rather than written where it is used.
##
## The tables come from `packages/data/i18n`, synced into `assets/i18n` by
## `nx run godot-friendslop:i18n:sync`. Godot only packs what lives under its
## own project directory, so the game reads a copy rather than the package.
##
## English is authoritative. A locale is allowed to be incomplete and every
## missing key falls through to English, because a half-translated menu is
## still playable and a blank one is not.

signal locale_changed

const DIR := "res://assets/i18n"
const NAMESPACES := ["common", "game.friendslop"]
const FALLBACK := "en"

## Scripts the engine's built-in font has no glyphs for. Everything else --
## Latin, its accents, Greek, Cyrillic -- it already draws, so those locales
## ship no font at all and cost nothing.
##
## Loaded on the locale that needs it rather than up front: the Japanese file is
## most of a mobile build's font budget on its own, and a phone playing in
## English should never pay for it.
const FONTS := {
	"hi": "res://assets/fonts/NotoSansDevanagari-Regular.ttf",
	"ja": "res://assets/fonts/NotoSansJP.ttf",
}

var _locales: Array[Dictionary] = []
var _fallback: Dictionary = {}
var _current: Dictionary = {}
var _current_code := FALLBACK


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_locales = _read_locales()
	_fallback = _read_locale(FALLBACK)
	set_locale(saved_locale())


## Endonyms, so the picker is readable by someone who cannot yet read the rest
## of the UI. Only locales with a directory on disk are offered -- the table
## lists what is planned, not what shipped.
func _read_locales() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var raw: Variant = _read_json("%s/locales.json" % DIR)
	if raw is Array:
		for entry: Variant in raw:
			if entry is Dictionary and DirAccess.dir_exists_absolute("%s/%s" % [DIR, entry.get("code", "")]):
				out.append(entry)
	if out.is_empty():
		out.append({"code": FALLBACK, "name": "English"})
	return out


func _read_locale(code: String) -> Dictionary:
	var flat: Dictionary = {}
	for ns: String in NAMESPACES:
		var raw: Variant = _read_json("%s/%s/%s.json" % [DIR, code, ns])
		if raw is Dictionary:
			_flatten(raw, "", flat)
	return flat


## Imported as a JSON resource in an export, a loose file in the editor and in
## headless test runs -- neither path is present in both, so both are tried.
func _read_json(path: String) -> Variant:
	if ResourceLoader.exists(path):
		var res: Variant = ResourceLoader.load(path)
		if res is JSON:
			return (res as JSON).data
	if not FileAccess.file_exists(path):
		return null
	var text := FileAccess.get_file_as_string(path)
	var json := JSON.new()
	if json.parse(text) != OK:
		push_warning("i18n: %s is not valid JSON (%s)" % [path, json.get_error_message()])
		return null
	return json.data


func _flatten(node: Dictionary, prefix: String, out: Dictionary) -> void:
	for key: Variant in node:
		var path := "%s.%s" % [prefix, key] if prefix != "" else str(key)
		var value: Variant = node[key]
		if value is Dictionary:
			_flatten(value, path, out)
		else:
			out[path] = str(value)


## Every string the current locale can draw, which is what a font check needs:
## coverage is a property of the whole table, not of the keys a screen happens
## to show.
func strings() -> Array:
	return _current.values()


func locales() -> Array[Dictionary]:
	return _locales


func locale_names() -> Array:
	var out: Array = []
	for entry: Dictionary in _locales:
		out.append(entry.get("name", entry.get("code", "?")))
	return out


func locale_index() -> int:
	for i in _locales.size():
		if _locales[i].get("code", "") == _current_code:
			return i
	return 0


func locale_code() -> String:
	return _current_code


func set_locale_index(index: int, remember := false) -> void:
	if index < 0 or index >= _locales.size():
		return
	set_locale(str(_locales[index].get("code", FALLBACK)), remember)


## `remember` is what separates a guess from an answer. Booting in the phone's
## own language is a guess, and writing it to disk would make the game look like
## the player had already chosen -- which is the one thing the first-run picker
## uses to decide whether to appear at all.
func set_locale(code: String, remember := false) -> void:
	var wanted := code if _has_locale(code) else FALLBACK
	if remember:
		save_locale(wanted)
	if wanted == _current_code and not _current.is_empty():
		return
	_current_code = wanted
	_current = _fallback if wanted == FALLBACK else _read_locale(wanted)
	TranslationServer.set_locale(wanted)
	_apply_font(wanted)
	locale_changed.emit()


## Hung off the built-in font as a fallback rather than replacing it: the menus
## keep the face they were designed around, and the extra font is only consulted
## for the glyphs the built-in one does not have.
func _apply_font(code: String) -> void:
	_set_fallbacks(_load_fonts([code]))


## The language picker is the one place that has to draw every script at once --
## it lists each language in its own -- so it asks for the whole set while it is
## open and gives it back on the way out. Anything less and the row a player
## cannot yet read is the row they are trying to choose.
func use_all_fonts() -> void:
	_set_fallbacks(_load_fonts(FONTS.keys()))


func use_locale_font() -> void:
	_apply_font(_current_code)


func _load_fonts(codes: Array) -> Array[Font]:
	var out: Array[Font] = []
	for code: Variant in codes:
		var path: String = FONTS.get(code, "")
		if path == "":
			continue
		var font: Font = load(path)
		if font == null:
			push_warning("i18n: %s has no font at %s" % [code, path])
			continue
		out.append(font)
	return out


func _set_fallbacks(fonts: Array[Font]) -> void:
	var base := ThemeDB.fallback_font
	if base != null:
		base.fallbacks = fonts


func _has_locale(code: String) -> bool:
	for entry: Dictionary in _locales:
		if entry.get("code", "") == code:
			return true
	return false


## `{{name}}` rather than Godot's own `{name}`, because the same tables are read
## by the TypeScript helper and a string that renders literally in one of the
## two is worse than either syntax.
func t(key: String, vars: Dictionary = {}) -> String:
	var text: String = _current.get(key, _fallback.get(key, key))
	if vars.is_empty():
		return text
	for name: Variant in vars:
		text = text.replace("{{%s}}" % name, str(vars[name]))
	return text


## Translates a list of keys in order, which is what the settings cyclers want:
## they hold ordered options and only ever show all of them at once.
func t_all(keys: Array) -> Array:
	var out: Array = []
	for key: Variant in keys:
		out.append(t(str(key)))
	return out


## The player's own language before their first visit to the settings book. A
## dialect the game does not ship (pt-BR, en-GB) still answers `pt` or `en`
## here, which is why the language part is what gets matched.
static func system_locale() -> String:
	return OS.get_locale_language()


const CONFIG_PATH := "user://gameplay.cfg"


static func saved_locale() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		return system_locale()
	return str(cfg.get_value("gameplay", "locale", system_locale()))


## Whether the player has ever answered the question, as opposed to having been
## guessed at. Only an explicit choice writes the key.
static func has_choice() -> bool:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		return false
	return cfg.has_section_key("gameplay", "locale")


static func save_locale(code: String) -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.set_value("gameplay", "locale", code)
	cfg.save(CONFIG_PATH)
