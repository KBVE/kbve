class_name DialogueState
extends RefCounted

## What a conversation remembers between conversations: the flags it set and the nodes it
## has already been through.
##
## Held apart from the runner because a flag outlives the talk that set it -- the toll is
## paid once, and every graph in the world can ask about it afterwards.

## Raised only when a flag actually moves, so a graph that sets the same flag on every
## pass through a node does not read as news each time.
signal flag_changed(name: String, on: bool)
## Raised the first time a node is reached, which is what a greeting that only happens
## once is keyed off.
signal seen_changed(node_id: String)

var flags: Dictionary = {}
var seen: Dictionary = {}


func set_flag(name: String, on := true) -> void:
	if has_flag(name) == on:
		return
	if on:
		flags[name] = true
	else:
		flags.erase(name)
	flag_changed.emit(name, on)


func has_flag(name: String) -> bool:
	return flags.get(name, false)


func mark_seen(node_id: String) -> void:
	if seen.has(node_id):
		return
	seen[node_id] = true
	seen_changed.emit(node_id)


func has_seen(node_id: String) -> bool:
	return seen.get(node_id, false)


func clear() -> void:
	flags.clear()
	seen.clear()


## Applies a node's or a choice's `do`, which is the only way a conversation writes
## anything down.
##
##     {"set": "toll_paid"}            {"set": ["a", "b"]}            {"clear": "angry"}
func apply(effects: Variant) -> void:
	if effects is not Dictionary:
		return
	var body: Dictionary = effects
	for name in _names(body.get("set", null)):
		set_flag(name, true)
	for name in _names(body.get("clear", null)):
		set_flag(name, false)


## Reads a condition. The shorthand is a bare flag name, because most conditions are one.
##
##     "toll_paid"        {"flag": "toll_paid"}        {"not": <cond>}
##     {"all": [<cond>]}  {"any": [<cond>]}            {"seen": "node_id"}
func test(condition: Variant) -> bool:
	if condition == null:
		return true
	if condition is String or condition is StringName:
		return has_flag(str(condition))
	if condition is not Dictionary:
		return true
	var body: Dictionary = condition
	if body.has("flag"):
		return has_flag(str(body["flag"]))
	if body.has("not"):
		return not test(body["not"])
	if body.has("seen"):
		return has_seen(str(body["seen"]))
	if body.has("all"):
		for part in _list(body["all"]):
			if not test(part):
				return false
		return true
	if body.has("any"):
		for part in _list(body["any"]):
			if test(part):
				return true
		return false
	## An empty object gates nothing, which is how a node with `"if": {}` reads.
	return true


func to_dict() -> Dictionary:
	return {"flags": flags.duplicate(), "seen": seen.duplicate()}


func from_dict(data: Variant) -> void:
	clear()
	if data is not Dictionary:
		return
	var body: Dictionary = data
	if body.get("flags") is Dictionary:
		flags = (body["flags"] as Dictionary).duplicate()
	if body.get("seen") is Dictionary:
		seen = (body["seen"] as Dictionary).duplicate()


func _names(raw: Variant) -> PackedStringArray:
	var out := PackedStringArray()
	if raw == null:
		return out
	if raw is Array:
		for name in raw:
			out.append(str(name))
		return out
	out.append(str(raw))
	return out


func _list(raw: Variant) -> Array:
	return raw if raw is Array else [raw]
