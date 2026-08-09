class_name ObserverHub
extends RefCounted

const ADDED := 1
const REMOVED := 2
const MATCHED := 4
const UNMATCHED := 8


class Watch:
	extends RefCounted
	var required: Array[StringName]
	var events: int
	var callback: Callable


var _watches: Array[Watch] = []
var _components: Dictionary = {}


func observe(required: Array[StringName], events: int, callback: Callable) -> Watch:
	var w := Watch.new()
	w.required = required
	w.events = events
	w.callback = callback
	_watches.append(w)
	return w


func unobserve(w: Watch) -> void:
	_watches.erase(w)


func track(e: ECSEntity) -> void:
	if _components.has(e.id()):
		return
	_components[e.id()] = {}
	e.on_component_added.connect(_on_added)
	e.on_component_removed.connect(_on_removed)


func untrack(e: ECSEntity) -> void:
	if not _components.has(e.id()):
		return
	_components.erase(e.id())
	e.on_component_added.disconnect(_on_added)
	e.on_component_removed.disconnect(_on_removed)


func _matches(id: int, required: Array[StringName]) -> bool:
	var names: Dictionary = _components[id]
	for n in required:
		if not names.has(n):
			return false
	return true


func _on_added(e: ECSEntity, c: ECSComponent) -> void:
	var id := e.id()
	if not _components.has(id):
		return
	var cname := c.name()
	var prev: Array[bool] = []
	for w in _watches:
		prev.append(_matches(id, w.required))
	_components[id][cname] = true
	for i in _watches.size():
		var w := _watches[i]
		var watched := w.required.is_empty() or w.required.has(cname)
		if w.events & ADDED and watched and _matches(id, w.required):
			w.callback.call(ADDED, e, c)
		if w.events & MATCHED and not prev[i] and _matches(id, w.required):
			w.callback.call(MATCHED, e, c)


func _on_removed(e: ECSEntity, c: ECSComponent) -> void:
	var id := e.id()
	if not _components.has(id):
		return
	var cname := c.name()
	var prev: Array[bool] = []
	for w in _watches:
		prev.append(_matches(id, w.required))
	_components[id].erase(cname)
	for i in _watches.size():
		var w := _watches[i]
		var watched := w.required.is_empty() or w.required.has(cname)
		if w.events & REMOVED and watched and prev[i]:
			w.callback.call(REMOVED, e, c)
		if w.events & UNMATCHED and prev[i] and not _matches(id, w.required):
			w.callback.call(UNMATCHED, e, c)
