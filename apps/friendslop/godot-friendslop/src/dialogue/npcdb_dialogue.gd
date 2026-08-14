class_name NpcdbDialogue
extends RefCounted

## Reads a conversation out of the NPCDB registry, so a talk is tracked with the rest of
## the NPC catalog rather than in a file only this game knows about.
##
## The catalog is authored as MDX and generated into `npcdb.json`, and its dialogue schema
## is not quite this game's: it carries prose rather than i18n keys, gates as small
## strings rather than objects, and has no else branch. This turns one into the other.
##
## Text is prose and used as written. I18n.t hands back whatever it is given when there is
## no such key, so a locale can still override any line by defining a key equal to the
## prose -- English needs nothing.
##
## `condition` accepts `flag:name`, `seen:node_id`, either negated with `!`, and several
## joined by `&&` or `,`, which are read as all-of.
##
## There is no else field in the schema, so a gated node that fails falls through to the
## next node in the list. That is how it reads in the MDX: the line for a stranger, then
## the line for a regular directly under it.

const DialogueGraphScript := preload("res://src/dialogue/dialogue_graph.gd")

const REGISTRY := "res://assets/npcdb/npcdb.json"


## The whole registry, or an empty one when it is missing.
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


static func npc(ref: String, path := REGISTRY) -> Dictionary:
	var entries: Variant = registry(path).get("npcs", [])
	if entries is not Array:
		return {}
	for entry: Variant in entries:
		if entry is Dictionary and str((entry as Dictionary).get("ref", "")) == ref:
			return entry
	return {}


## The conversation `ref` carries, as a graph this game can walk. A graph with the error
## on it comes back when the NPC or its tree is missing, which the caller reports the same
## way it reports a broken file.
static func graph(ref: String, path := REGISTRY) -> DialogueGraph:
	var entry := npc(ref, path)
	if entry.is_empty():
		return _broken("npcdb has no npc '%s'" % ref)
	var tree: Variant = entry.get("dialogueTree", entry.get("dialogue_tree", null))
	if tree is not Dictionary:
		return _broken("npc '%s' has no dialogue tree" % ref)
	return DialogueGraphScript.from_dict(_as_graph(entry, tree))


## Kept out of `graph` so a test can read the shape without a file on disk.
static func to_graph_dict(entry: Dictionary, tree: Dictionary) -> Dictionary:
	return _as_graph(entry, tree)


static func _as_graph(entry: Dictionary, tree: Dictionary) -> Dictionary:
	var raw: Variant = tree.get("nodes", [])
	var list: Array = raw if raw is Array else []
	var nodes := {}
	for i in list.size():
		var source: Variant = list[i]
		if source is not Dictionary:
			continue
		var node: Dictionary = source
		var id := str(node.get("id", ""))
		if id == "":
			continue
		nodes[id] = _as_node(node, _next_id(list, i))
	return {
		"start": str(tree.get("entryNodeId", tree.get("entry_node_id", ""))),
		"speaker": str(entry.get("name", "")),
		"nodes": nodes,
	}


## The node after this one, which is where a failed gate lands.
static func _next_id(list: Array, index: int) -> String:
	for i in range(index + 1, list.size()):
		var entry: Variant = list[i]
		if entry is Dictionary:
			var id := str((entry as Dictionary).get("id", ""))
			if id != "":
				return id
	return ""


static func _as_node(node: Dictionary, fallback: String) -> Dictionary:
	var out := {"line": str(node.get("text", ""))}
	var speaker := str(node.get("speakerOverride", node.get("speaker_override", "")))
	if speaker != "":
		out["speaker"] = speaker
	var next := str(node.get("nextNodeId", node.get("next_node_id", "")))
	if next != "":
		out["to"] = next

	var gate: Variant = _condition(str(node.get("condition", "")))
	if gate != null:
		out["if"] = gate
		if fallback != "":
			out["else"] = fallback

	var effects := _effects(str(node.get("triggerOnEnter", node.get("trigger_on_enter", ""))))
	if not effects.is_empty():
		out["do"] = effects

	var choices := _choices(node)
	if not choices.is_empty():
		out["choices"] = choices
	return out


static func _choices(node: Dictionary) -> Array:
	var raw: Variant = node.get("options", [])
	if raw is not Array:
		return []
	var out: Array = []
	for entry: Variant in raw:
		if entry is not Dictionary:
			continue
		var option: Dictionary = entry
		var choice := {"text": str(option.get("label", ""))}
		var next := str(option.get("nextNodeId", option.get("next_node_id", "")))
		if next != "":
			choice["to"] = next

		var gates: Array = []
		var gate: Variant = _condition(str(option.get("condition", "")))
		if gate != null:
			gates.append(gate)
		for flag in _flags(option.get("requiredFlags", option.get("required_flags", null))):
			gates.append(_flag_gate(flag))
		if gates.size() == 1:
			choice["if"] = gates[0]
		elif gates.size() > 1:
			choice["if"] = {"all": gates}

		var set_flag := str(option.get("setFlag", option.get("set_flag", "")))
		if set_flag != "":
			choice["do"] = {"set": set_flag}
		out.append(choice)
	return out


## A gate, or null where there is nothing to gate on.
static func _condition(text: String) -> Variant:
	var parts := _split(text)
	var gates: Array = []
	for part in parts:
		var gate: Variant = _term(part)
		if gate != null:
			gates.append(gate)
	if gates.is_empty():
		return null
	return gates[0] if gates.size() == 1 else {"all": gates}


static func _split(text: String) -> PackedStringArray:
	var out := PackedStringArray()
	for part in text.replace("&&", ",").split(",", false):
		var trimmed := part.strip_edges()
		if trimmed != "":
			out.append(trimmed)
	return out


static func _term(part: String) -> Variant:
	var body := part
	var negated := body.begins_with("!")
	if negated:
		body = body.substr(1).strip_edges()
	var gate: Variant = null
	if body.begins_with("seen:"):
		gate = {"seen": body.substr(5)}
	elif body.begins_with("flag:"):
		gate = {"flag": body.substr(5)}
	elif body != "":
		## A bare name is a flag, which is how most of the catalog writes them.
		gate = {"flag": body}
	if gate == null:
		return null
	return {"not": gate} if negated else gate


static func _flag_gate(flag: String) -> Dictionary:
	var negated := flag.begins_with("!")
	var name := flag.substr(1) if negated else flag
	return {"not": {"flag": name}} if negated else {"flag": name}


## `trigger_on_enter` is an event name in the schema. The ones this game understands set
## or clear a flag; anything else is somebody else's event and is left alone.
static func _effects(trigger: String) -> Dictionary:
	var out := {}
	for part in _split(trigger):
		if part.begins_with("set_flag:"):
			out["set"] = part.substr(9)
		elif part.begins_with("clear_flag:"):
			out["clear"] = part.substr(11)
	return out


static func _flags(raw: Variant) -> PackedStringArray:
	var out := PackedStringArray()
	if raw is Array:
		for flag in raw:
			var name := str(flag).strip_edges()
			if name != "":
				out.append(name)
	return out


static func _broken(why: String) -> DialogueGraph:
	push_error("npcdb dialogue: %s" % why)
	return DialogueGraphScript.from_dict({"start": "", "nodes": {}})
