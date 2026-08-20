extends Node


signal initialized(available: bool)

var api: Node


func _ready() -> void:
	if not ClassDB.class_exists("QSteam"):
		initialized.emit(false)
		return
	api = ClassDB.instantiate("QSteam")
	api.steam_initialized.connect(func(ok: bool) -> void: initialized.emit(ok))
	add_child(api)


func available() -> bool:
	return api != null and api.is_available()


func persona_name() -> String:
	return api.persona_name() if available() else ""


func steam_id() -> String:
	return api.steam_id() if available() else ""


func set_achievement(id: String) -> bool:
	return api.set_achievement(id) if available() else false


func rich_presence(key: String, value: String) -> void:
	if available():
		api.set_rich_presence(key, value)


func clear_rich_presence() -> void:
	if available():
		api.clear_rich_presence()
