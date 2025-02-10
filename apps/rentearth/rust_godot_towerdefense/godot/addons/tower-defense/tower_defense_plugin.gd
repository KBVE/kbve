extends Node

# Global.
var music_manager: MusicManager
# var ui_cache: Maiky
# var camera_manager: CameraManager
var game_manager: GameManager

func _ready():
	if not game_manager:
		game_manager = GameManager.new()
		game_manager.name = "GameManager"
		add_child(game_manager)
		music_manager = game_manager.get_music_manager()
		music_manager.adjust_sfx_volume(-20.0)
		music_manager.adjust_effects_volume(-20.0)
		music_manager.adjust_music_volume(-20.0)
		print("MusicManager initialized and added to the scene tree!")
