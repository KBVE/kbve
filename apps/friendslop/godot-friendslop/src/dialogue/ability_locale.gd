class_name AbilityLocale
extends RefCounted

## Translations for ability text that more than one creature uses, keyed by the
## ability id rather than by the npc that happens to be showing it.
##
## `tackle` sits on 19 npcs with the same sentence. Translating it inside each of
## those entries would mean writing the line 19 times per language and watching the
## copies drift, so the shared text is authored once under abilitydb and shipped as
## its own kbve.common.LocaleTable. The English still lives inline on the npc, and
## is still the fallback.

const TableScript := preload("res://src/dialogue/locale_table.gd")
const NpcLocaleScript := preload("res://src/dialogue/npcdb_locale.gd")

const DB := "abilitydb"


static func path_for(locale: String) -> String:
	return TableScript.path_for(DB, locale)


## Translated text for "<ability id>.<field>", or `fallback` when no shared
## translation exists for this language.
static func t(key: String, fallback: String) -> String:
	return TableScript.t(DB, key, fallback)


static func forget() -> void:
	TableScript.forget(DB)


## One field of one ability as the player should read it.
##
## An npc that wants its own wording for a shared move wins, because a creature
## whose "Bite" is not everyone else's bite is exactly the case the shared table
## cannot serve. Failing that the shared table answers, and failing that the
## English on the npc entry itself does.
static func field(npc_ref: String, ability: Dictionary, name: String) -> String:
	var english := str(ability.get(name, ""))
	var id := str(ability.get("id", ""))
	if id == "":
		return english
	var override := NpcLocaleScript.t(
			"%s.abilities.%s.%s" % [npc_ref, id, name], "")
	if override != "":
		return override
	return t("%s.%s" % [id, name], english)


## Every ability on `entry`, with its text resolved for the active language.
static func resolve(entry: Dictionary) -> Array:
	var raw: Variant = entry.get("abilities", [])
	if raw is not Array:
		return []
	var npc_ref := str(entry.get("ref", ""))
	var out: Array = []
	for source: Variant in raw:
		if source is not Dictionary:
			continue
		var ability: Dictionary = (source as Dictionary).duplicate(true)
		for name: String in ["name", "description"]:
			if ability.has(name):
				ability[name] = field(npc_ref, source, name)
		out.append(ability)
	return out
