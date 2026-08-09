class_name Relations
extends RefCounted

signal relation_added(source: int, rel: StringName, target: int, data: Variant)
signal relation_removed(source: int, rel: StringName, target: int)

var _out: Dictionary = {}
var _in: Dictionary = {}


func link(source: int, rel: StringName, target: int, data: Variant = true) -> void:
	_out.get_or_add(source, {}).get_or_add(rel, {})[target] = data
	_in.get_or_add(target, {}).get_or_add(rel, {})[source] = true
	relation_added.emit(source, rel, target, data)


func unlink(source: int, rel: StringName, target: int) -> void:
	if not has_relation(source, rel, target):
		return
	_out[source][rel].erase(target)
	_in[target][rel].erase(source)
	relation_removed.emit(source, rel, target)


func unlink_all(id: int) -> void:
	for rel in _out.get(id, {}).keys():
		for target in _out[id][rel].keys():
			unlink(id, rel, target)
	for rel in _in.get(id, {}).keys():
		for source in _in[id][rel].keys():
			unlink(source, rel, id)
	_out.erase(id)
	_in.erase(id)


func has_relation(source: int, rel: StringName, target: int) -> bool:
	return _out.get(source, {}).get(rel, {}).has(target)


func targets(source: int, rel: StringName) -> Array:
	return _out.get(source, {}).get(rel, {}).keys()


func sources(target: int, rel: StringName) -> Array:
	return _in.get(target, {}).get(rel, {}).keys()


func relation_data(source: int, rel: StringName, target: int) -> Variant:
	return _out.get(source, {}).get(rel, {}).get(target)
