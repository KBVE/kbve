extends Node

## Everything the player has been told and agreed to, kept for good.
##
## A conversation writes flags and the nodes it has been through; both outlive the talk
## that set them, and the toll paid last night has to still be paid this morning. This is
## the one copy: the interactor reads it rather than carrying its own, so anything else
## that can talk shares the same memory of what was said.
##
## Flag changes also go out on the world's event bus, which is what lets something that is
## not a conversation react to one.

const PATH := "user://journal.cfg"
const SECTION := "dialogue"

signal flag_changed(name: String, on: bool)

var _state := DialogueState.new()
## Held down while loading, so reading a saved file does not read as the player having
## just done all of it.
var _quiet := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_state.flag_changed.connect(_on_flag_changed)
	_state.seen_changed.connect(_on_seen_changed)
	load_now()


func state() -> DialogueState:
	return _state


func has_flag(name: String) -> bool:
	return _state.has_flag(name)


## For anything outside a conversation that has news of its own -- a bridge crossed, a
## fish landed -- so the graphs can ask about it in the same breath as the toll.
func set_flag(name: String, on := true) -> void:
	_state.set_flag(name, on)


func _on_flag_changed(name: String, on: bool) -> void:
	if _quiet:
		return
	flag_changed.emit(name, on)
	if Game and Game.events:
		Game.events.notify(EventNames.FLAG_CHANGED, {"flag": name, "on": on})
	save_now()


## A node is only ever seen for the first time once, so this is rare enough to write out
## on the spot rather than hope the game is closed politely.
func _on_seen_changed(_node_id: String) -> void:
	if _quiet:
		return
	save_now()


func load_now() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(PATH) != OK:
		return
	_quiet = true
	_state.from_dict({
		"flags": cfg.get_value(SECTION, "flags", {}),
		"seen": cfg.get_value(SECTION, "seen", {}),
	})
	_quiet = false


func save_now() -> void:
	var cfg := ConfigFile.new()
	var body := _state.to_dict()
	cfg.set_value(SECTION, "flags", body["flags"])
	cfg.set_value(SECTION, "seen", body["seen"])
	cfg.save(PATH)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_PREDELETE:
		save_now()


## Wipes the slate. Kept for a fresh start rather than called anywhere yet -- an existing
## player's memory is not something to clear by accident.
func forget_everything() -> void:
	_state.clear()
	save_now()
