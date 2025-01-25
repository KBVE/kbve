extends Control

var mapSelectContainer : PanelContainer
var music_manager: MusicManager
var maiky: Maiky

func _on_quit_button_pressed():
	get_tree().quit()

func _on_start_button_pressed():
	if not mapSelectContainer:
		var mscScene := preload("res://Scenes/ui/mainMenu/select_map_container.tscn")
		var msc := mscScene.instantiate()
		mapSelectContainer = msc
		add_child(msc)

func _ready():
	music_manager = TowerDefensePlugin.music_manager
	if music_manager:
		music_manager.load_music("res://audio/track1.ogg")
	maiky = TowerDefensePlugin.maiky
	if maiky:
		maiky.show_message("Welcome to Tower Defense!")
