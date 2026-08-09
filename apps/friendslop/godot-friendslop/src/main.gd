extends Node3D


func _ready() -> void:
	Game.events.add_callable(EventNames.PLAYER_MOVED_CHUNK, _on_player_moved_chunk)


func _exit_tree() -> void:
	Game.events.remove_callable(EventNames.PLAYER_MOVED_CHUNK, _on_player_moved_chunk)


func _on_player_moved_chunk(e: GameEvent) -> void:
	print("player chunk: ", e.data)
