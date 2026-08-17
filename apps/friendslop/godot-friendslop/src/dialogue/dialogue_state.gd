class_name DialogueState
extends RefCounted


signal flag_changed(name: String, on: bool)
signal seen_changed(node_id: String)
signal asked(verb: String, argument: String)

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


func apply(effects: Variant) -> void:
	if effects is not Dictionary:
		return
	var body: Dictionary = effects
	for name in _names(body.get("set", null)):
		set_flag(name, true)
	for name in _names(body.get("clear", null)):
		set_flag(name, false)
	for verb: Variant in body:
		if str(verb) == "set" or str(verb) == "clear":
			continue
		asked.emit(str(verb), str(body[verb]))


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
	if body.has("num"):
		return _compare(number(str(body["num"])), str(body.get("op", ">=")),
				float(body.get("value", 0.0)))
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
	return true


var numbers: Dictionary = {}


func set_number(name: String, value: float) -> void:
	numbers[name] = value


func number(name: String) -> float:
	return float(numbers.get(name, 0.0))


func seen_count() -> int:
	return seen.size()


static func _compare(left: float, op: String, right: float) -> bool:
	match op:
		">=": return left >= right
		"<=": return left <= right
		">": return left > right
		"<": return left < right
		"==": return is_equal_approx(left, right)
		"!=": return not is_equal_approx(left, right)
	return false


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
