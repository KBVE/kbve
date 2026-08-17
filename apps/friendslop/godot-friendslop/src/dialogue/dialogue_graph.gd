class_name DialogueGraph
extends RefCounted


const DEFAULT_START := "start"

var start := DEFAULT_START
var speaker := ""
var nodes: Dictionary = {}

var _errors: PackedStringArray = []


static func from_path(path: String) -> DialogueGraph:
	var raw: Variant = null
	if ResourceLoader.exists(path):
		var res: Variant = ResourceLoader.load(path)
		if res is JSON:
			raw = (res as JSON).data
	if raw == null and FileAccess.file_exists(path):
		var json := JSON.new()
		if json.parse(FileAccess.get_file_as_string(path)) == OK:
			raw = json.data
		else:
			var broken := DialogueGraph.new()
			broken._errors.append("%s is not valid JSON (%s)" % [path, json.get_error_message()])
			return broken
	if raw == null:
		var missing := DialogueGraph.new()
		missing._errors.append("%s does not exist" % path)
		return missing
	return from_dict(raw)


static func from_dict(raw: Variant) -> DialogueGraph:
	var graph := DialogueGraph.new()
	if raw is not Dictionary:
		graph._errors.append("a graph has to be an object")
		return graph
	var data: Dictionary = raw
	graph.start = str(data.get("start", DEFAULT_START))
	graph.speaker = str(data.get("speaker", ""))
	var nodes: Variant = data.get("nodes", {})
	if nodes is not Dictionary:
		graph._errors.append("`nodes` has to be an object")
		return graph
	graph.nodes = nodes
	graph._validate()
	return graph


func has(id: String) -> bool:
	return nodes.has(id)


func node(id: String) -> Dictionary:
	var found: Variant = nodes.get(id, {})
	return found if found is Dictionary else {}


func speaker_of(id: String) -> String:
	return str(node(id).get("speaker", speaker))


func errors() -> PackedStringArray:
	return _errors


func is_valid() -> bool:
	return _errors.is_empty()


func text_keys() -> PackedStringArray:
	var keys := PackedStringArray()
	if speaker != "":
		keys.append(speaker)
	for id: Variant in nodes:
		var entry := node(str(id))
		for field in ["line", "speaker"]:
			var key := str(entry.get(field, ""))
			if key != "" and not keys.has(key):
				keys.append(key)
		for choice in _choices_of(entry):
			var text := str(choice.get("text", ""))
			if text != "" and not keys.has(text):
				keys.append(text)
	return keys


func _choices_of(entry: Dictionary) -> Array:
	var raw: Variant = entry.get("choices", [])
	return raw if raw is Array else []


func _validate() -> void:
	if not nodes.has(start):
		_errors.append("start node '%s' is not in the graph" % start)
	for id: Variant in nodes:
		var key := str(id)
		var entry: Variant = nodes[key]
		if entry is not Dictionary:
			_errors.append("node '%s' has to be an object" % key)
			continue
		var body: Dictionary = entry
		if str(body.get("line", "")) == "" and _choices_of(body).is_empty():
			_errors.append("node '%s' says nothing and offers nothing" % key)
		_check_jump(key, "to", body)
		_check_jump(key, "else", body)
		var choices := _choices_of(body)
		for i in choices.size():
			var choice: Variant = choices[i]
			if choice is not Dictionary:
				_errors.append("choice %d of '%s' has to be an object" % [i, key])
				continue
			if str((choice as Dictionary).get("text", "")) == "":
				_errors.append("choice %d of '%s' has no text" % [i, key])
			_check_jump("%s choice %d" % [key, i], "to", choice)


func _check_jump(where: String, field: String, entry: Dictionary) -> void:
	var target := str(entry.get(field, ""))
	if target != "" and not nodes.has(target):
		_errors.append("%s jumps to '%s', which is not in the graph" % [where, target])
