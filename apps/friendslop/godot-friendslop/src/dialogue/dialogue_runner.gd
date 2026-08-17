class_name DialogueRunner
extends RefCounted


signal line_changed
signal finished

const MAX_HOPS := 64

var graph: DialogueGraph
var state: DialogueState

var _at := ""
var _done := true


func start(with_graph: DialogueGraph, with_state: DialogueState, at := "") -> bool:
	graph = with_graph
	state = with_state if with_state != null else DialogueState.new()
	_done = false
	_at = ""
	if graph == null or not graph.is_valid():
		push_error("dialogue: refusing to run a graph that did not load cleanly")
		_finish()
		return false
	return _enter(at if at != "" else graph.start)


func is_running() -> bool:
	return not _done


func node_id() -> String:
	return _at


func line_key() -> String:
	return str(graph.node(_at).get("line", "")) if not _done else ""


func speaker_key() -> String:
	return graph.speaker_of(_at) if not _done else ""


func choices() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if _done:
		return out
	var raw: Variant = graph.node(_at).get("choices", [])
	if raw is not Array:
		return out
	var list: Array = raw
	for i in list.size():
		var entry: Variant = list[i]
		if entry is not Dictionary:
			continue
		var choice: Dictionary = entry
		if not state.test(choice.get("if", null)):
			continue
		out.append({&"index": i, &"text": str(choice.get("text", ""))})
	return out


func choose(index: int) -> bool:
	if _done:
		return false
	var raw: Variant = graph.node(_at).get("choices", [])
	if raw is not Array:
		return false
	var list: Array = raw
	if index < 0 or index >= list.size():
		return false
	var entry: Variant = list[index]
	if entry is not Dictionary:
		return false
	var choice: Dictionary = entry
	if not state.test(choice.get("if", null)):
		return false
	state.apply(choice.get("do", null))
	return _enter(str(choice.get("to", "")))


func advance() -> bool:
	if _done:
		return false
	if not choices().is_empty():
		return true
	return _enter(str(graph.node(_at).get("to", "")))


func stop() -> void:
	if not _done:
		_finish()


func _enter(id: String) -> bool:
	var at := id
	for hop in MAX_HOPS:
		if at == "":
			_finish()
			return false
		if not graph.has(at):
			push_error("dialogue: '%s' is not in the graph" % at)
			_finish()
			return false
		var entry := graph.node(at)
		if not state.test(entry.get("if", null)):
			at = str(entry.get("else", ""))
			continue
		_at = at
		state.mark_seen(at)
		state.apply(entry.get("do", null))
		line_changed.emit()
		return true
	push_error("dialogue: '%s' gates in a circle" % id)
	_finish()
	return false


func _finish() -> void:
	_at = ""
	_done = true
	finished.emit()
