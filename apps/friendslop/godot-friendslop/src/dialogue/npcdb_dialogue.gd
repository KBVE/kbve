class_name NpcdbDialogue
extends RefCounted


const DialogueGraphScript := preload("res://src/dialogue/dialogue_graph.gd")
const LocaleScript := preload("res://src/dialogue/npcdb_locale.gd")

const REGISTRY := "res://assets/npcdb/npcdb.json"


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


static func graph(ref: String, path := REGISTRY) -> DialogueGraph:
	var entry := npc(ref, path)
	if entry.is_empty():
		return _broken("npcdb has no npc '%s'" % ref)
	var tree: Variant = entry.get("dialogueTree", entry.get("dialogue_tree", null))
	if tree is not Dictionary:
		return _broken("npc '%s' has no dialogue tree" % ref)
	return DialogueGraphScript.from_dict(_as_graph(entry, tree))


static func to_graph_dict(entry: Dictionary, tree: Dictionary) -> Dictionary:
	return _as_graph(entry, tree)


static func _as_graph(entry: Dictionary, tree: Dictionary) -> Dictionary:
	var raw: Variant = tree.get("nodes", [])
	var list: Array = raw if raw is Array else []
	var ref := str(entry.get("ref", ""))
	var nodes := {}
	for i in list.size():
		var source: Variant = list[i]
		if source is not Dictionary:
			continue
		var node: Dictionary = source
		var id := str(node.get("id", ""))
		if id == "":
			continue
		nodes[id] = _as_node(node, _next_id(list, i), ref, id)
	return {
		"start": str(tree.get("entryNodeId", tree.get("entry_node_id", ""))),
		"speaker": LocaleScript.t("%s.name" % ref, str(entry.get("name", ""))),
		"nodes": nodes,
	}


static func _next_id(list: Array, index: int) -> String:
	for i in range(index + 1, list.size()):
		var entry: Variant = list[i]
		if entry is Dictionary:
			var id := str((entry as Dictionary).get("id", ""))
			if id != "":
				return id
	return ""


## Keyed by the node's own id rather than its position: reordering the English
## dialogue must not silently repoint every translation at the wrong line.
static func _as_node(node: Dictionary, fallback: String, ref := "", id := "") -> Dictionary:
	var stem := "%s.dialogue_tree.nodes.%s" % [ref, id]
	var out := {"line": LocaleScript.t("%s.text" % stem, str(node.get("text", "")))}
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

	var choices := _choices(node, stem)
	if not choices.is_empty():
		out["choices"] = choices
	return out


static func _choices(node: Dictionary, stem := "") -> Array:
	var raw: Variant = node.get("options", [])
	if raw is not Array:
		return []
	var out: Array = []
	for entry: Variant in raw:
		if entry is not Dictionary:
			continue
		var option: Dictionary = entry
		var choice := {"text": LocaleScript.t(
				"%s.options.%s.label" % [stem, str(option.get("id", ""))],
				str(option.get("label", "")))}
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


const OPS := [">=", "<=", "!=", "==", ">", "<"]


static func _term(part: String) -> Variant:
	var body := part
	var negated := body.begins_with("!")
	if negated:
		body = body.substr(1).strip_edges()
	var counted: Variant = _number_term(body)
	if counted != null:
		return {"not": counted} if negated else counted
	var gate: Variant = null
	if body.begins_with("seen:"):
		gate = {"seen": body.substr(5)}
	elif body.begins_with("flag:"):
		gate = {"flag": body.substr(5)}
	elif body != "":
		gate = {"flag": body}
	if gate == null:
		return null
	return {"not": gate} if negated else gate


static func _number_term(body: String) -> Variant:
	for op: String in OPS:
		var at := body.find(op)
		if at <= 0:
			continue
		var name := body.substr(0, at).strip_edges()
		var value := body.substr(at + op.length()).strip_edges()
		if name == "" or not value.is_valid_float():
			continue
		return {"num": name, "op": op, "value": value.to_float()}
	return null


static func _flag_gate(flag: String) -> Dictionary:
	var negated := flag.begins_with("!")
	var name := flag.substr(1) if negated else flag
	return {"not": {"flag": name}} if negated else {"flag": name}


const ASKS := ["quest_start", "quest_turn_in", "xp", "respect"]


static func _effects(trigger: String) -> Dictionary:
	var out := {}
	for part in _split(trigger):
		if part.begins_with("set_flag:"):
			out["set"] = part.substr(9)
			continue
		if part.begins_with("clear_flag:"):
			out["clear"] = part.substr(11)
			continue
		for verb: String in ASKS:
			var head := verb + ":"
			if part.begins_with(head):
				out[verb] = part.substr(head.length())
				break
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
