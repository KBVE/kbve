extends Node

# Global.
var music_manager: MusicManager
var maiky: Maiky
# var camera_manager: CameraManager

func _ready():
	if not music_manager:
		music_manager = MusicManager.new()
		add_child(music_manager)
		print("MusicManager initialized and added to the scene tree!")
	if not maiky:
		maiky = Maiky.new()
		add_child(maiky)
		print("Maiky UI library has been loaded!")	