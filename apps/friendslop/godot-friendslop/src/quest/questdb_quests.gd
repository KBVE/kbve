class_name QuestdbQuests
extends RefCounted


const REGISTRY := "res://assets/questdb/questdb.json"
const TAG := "friendslop"

const CATEGORY_PREFIX := "QUEST_CATEGORY_"
const OBJECTIVE_PREFIX := "OBJECTIVE_"

const FLAG_TARGET := "flag:"


static func registry(path := REGISTRY) -> Dictionary:
	var raw: Variant = null
	if ResourceLoader.exists(path):
		var res: Variant = ResourceLoader.load(path)
		if res is JSON:
			raw = (res as JSON).data
	if raw == null and FileAccess.file_exists(path):
		var json := JSON.new()
		if json.parse(FileAccess.get_file_as_string(path)) == OK:
			raw = json.data
	return raw if raw is Dictionary else {}


static func all(path := REGISTRY) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var raw: Variant = registry(path).get("quests", [])
	if raw is not Array:
		return out
	for entry: Variant in raw:
		if entry is not Dictionary:
			continue
		var quest: Dictionary = entry
		if not _ours(quest):
			continue
		out.append(_read(quest))
	return out


static func quest(ref: String, path := REGISTRY) -> Dictionary:
	for entry in all(path):
		if str(entry["ref"]) == ref:
			return entry
	return {}


static func _ours(quest: Dictionary) -> bool:
	var tags: Variant = quest.get("tags", [])
	if tags is not Array:
		return false
	for tag: Variant in tags:
		if str(tag) == TAG:
			return true
	return false


static func _read(quest: Dictionary) -> Dictionary:
	return {
		"ref": str(quest.get("ref", "")),
		"title": str(quest.get("title", quest.get("ref", ""))),
		"description": str(quest.get("description", "")),
		"category": _plain(str(quest.get("category", "")), CATEGORY_PREFIX),
		"givers": _refs(quest.get("giverNpcRefs", quest.get("giver_npc_refs", null))),
		"turn_in": _refs(quest.get("turnInNpcRefs", quest.get("turn_in_npc_refs", null))),
		"required_flags": _refs(quest.get("requiredFlags", quest.get("required_flags", null))),
		"steps": _steps(quest),
		"rewards": _rewards(quest.get("rewards", null)),
	}


static func _steps(quest: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var raw: Variant = quest.get("steps", [])
	if raw is not Array:
		return out
	for entry: Variant in raw:
		if entry is not Dictionary:
			continue
		var step: Dictionary = entry
		out.append({
			"id": str(step.get("id", "")),
			"title": str(step.get("title", "")),
			"description": str(step.get("description", "")),
			"next": str(step.get("nextStepId", step.get("next_step_id", ""))),
			"objectives": _objectives(step),
		})
	return out


static func _objectives(step: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var raw: Variant = step.get("objectives", [])
	if raw is not Array:
		return out
	for entry: Variant in raw:
		if entry is not Dictionary:
			continue
		var objective: Dictionary = entry
		out.append({
			"id": str(objective.get("id", "")),
			"description": str(objective.get("description", "")),
			"type": _plain(str(objective.get("type", "")), OBJECTIVE_PREFIX),
			"targets": _refs(objective.get("targetRefs", objective.get("target_refs", null))),
			"amount": maxi(int(objective.get("requiredAmount",
					objective.get("required_amount", 1))), 1),
			"optional": bool(objective.get("optional", false)),
		})
	return out


static func _rewards(raw: Variant) -> Dictionary:
	var body: Dictionary = raw if raw is Dictionary else {}
	return {
		"xp": int(body.get("xp", 0)),
		"respect": int(body.get("reputationAmount", body.get("reputation_amount", 0))),
		"respect_with": str(body.get("reputationFaction", body.get("reputation_faction", ""))),
	}


static func _plain(value: String, prefix: String) -> String:
	var body := value.trim_prefix(prefix)
	return body.to_lower()


static func _refs(raw: Variant) -> PackedStringArray:
	var out := PackedStringArray()
	if raw is Array:
		for value: Variant in raw:
			var text := str(value).strip_edges()
			if text != "":
				out.append(text)
	return out


static func flag_of(objective: Dictionary) -> String:
	for target: String in objective.get("targets", PackedStringArray()):
		if target.begins_with(FLAG_TARGET):
			return target.substr(FLAG_TARGET.length())
	return ""
