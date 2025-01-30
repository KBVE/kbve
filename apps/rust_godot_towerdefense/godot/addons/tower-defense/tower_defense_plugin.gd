extends Node

# Global.
var music_manager: MusicManager
var maiky: Maiky
# var camera_manager: CameraManager

func _ready():
	if not music_manager:
		music_manager = MusicManager.new()
		music_manager.name = "MusicManager"
		add_child(music_manager)
		music_manager.adjust_effects_volume(-80.0)
		music_manager.adjust_music_volume(-80.0)
		print("MusicManager initialized and added to the scene tree!")
	if not maiky:
		maiky = Maiky.new()
		maiky.name = "Maiky"
		add_child(maiky)
		print("Maiky UI library has been loaded!")	
