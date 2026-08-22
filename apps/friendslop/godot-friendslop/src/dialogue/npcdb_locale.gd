class_name NpcdbLocale
extends RefCounted

## Translations for the npc catalogue, generated from the i18n block of each MDX
## entry and shipped as one kbve.common.LocaleTable per language.
##
## English is not a table: it stays in npcdb.json itself and is what a missing key
## falls back to, so a half-translated catalogue reads as English rather than as a
## raw key.

const TableScript := preload("res://src/dialogue/locale_table.gd")

const DB := "npcdb"


static func path_for(locale: String) -> String:
	return TableScript.path_for(DB, locale)


## Translated text for "<ref>.<field path>", or `fallback` when the catalogue has
## nothing for this language.
static func t(key: String, fallback: String) -> String:
	return TableScript.t(DB, key, fallback)


static func forget() -> void:
	TableScript.forget(DB)
