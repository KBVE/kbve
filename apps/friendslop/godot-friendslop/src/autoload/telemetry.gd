extends Node

## Client error reporting. The batching, the transport and the Rust panic hook all
## live in q's TelemetryManager; this is the GDScript face of it, so game code can
## report without knowing the extension is there — and so the whole thing degrades
## to a no-op rather than a crash when the extension failed to load, which is
## exactly the situation you most want the rest of the game to survive.

var _manager: Node


func _ready() -> void:
	if not ClassDB.class_exists("TelemetryManager"):
		push_warning("Telemetry: q's TelemetryManager is absent — errors go unreported")
		return
	_manager = ClassDB.instantiate("TelemetryManager")
	_manager.name = "TelemetryManager"
	add_child(_manager)


func is_active() -> bool:
	return _manager != null


## An error the game saw coming and dealt with.
func report(error_type: String, message: String, stack: String = "") -> void:
	if _manager == null:
		return
	_manager.report(error_type, message, _stack_or_current(stack))


## An error nothing handled. Same pipe, flagged so the dashboard can tell them apart.
func report_unhandled(error_type: String, message: String, stack: String = "") -> void:
	if _manager == null:
		return
	_manager.report_unhandled(error_type, message, _stack_or_current(stack))


## Mirrors an error into the Godot log as well as the pipe, for the common case
## where you were about to push_error anyway.
func error(error_type: String, message: String) -> void:
	push_error("%s: %s" % [error_type, message])
	report(error_type, message)


## The scene or level errors are currently happening in. A filter dimension on the
## dashboard, not part of the grouping, so moving between scenes never splits an
## existing error group.
func set_scene(scene: String) -> void:
	if _manager == null:
		return
	_manager.set_scene(scene)


func set_enabled(enabled: bool) -> void:
	if _manager == null:
		return
	_manager.set_enabled(enabled)


func session_id() -> String:
	if _manager == null:
		return ""
	return _manager.get_session_id()


func flush() -> void:
	if _manager == null:
		return
	_manager.flush()


## get_stack() returns frames only when the debugger is attached, so this is a
## best-effort stack in the editor and empty in an exported build. The server
## fingerprints on the message when the stack is empty, so grouping still works.
func _stack_or_current(stack: String) -> String:
	if not stack.is_empty():
		return stack
	var frames := get_stack()
	if frames.is_empty():
		return ""
	var lines := PackedStringArray()
	for frame in frames:
		lines.append("%s:%d in %s" % [frame.source, frame.line, frame.function])
	return "\n".join(lines)
