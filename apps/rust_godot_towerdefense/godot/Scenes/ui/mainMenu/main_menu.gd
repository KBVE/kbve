extends Control

var mapSelectContainer : Node
var music_manager: MusicManager
var maiky: Maiky

func _on_quit_button_pressed():
	get_tree().quit()

func _on_start_button_pressed():
	if not mapSelectContainer:
		#var mscScene := preload("res://Scenes/ui/mainMenu/select_map_container.tscn")
		var gridScene := preload("res://Scenes/maps/GridMapNode.tscn")
		var gs := gridScene.instantiate()
		mapSelectContainer = gs
		add_child(gs)

func _ready():
	music_manager = TowerDefensePlugin.music_manager
	if music_manager:
		music_manager.load_music("res://audio/track1.ogg")
	maiky = TowerDefensePlugin.maiky
	if maiky:
		maiky.show_message("Welcome to Tower Defense!")
		maiky.show_avatar_message("Watch out for the fires", "res://Assets/npc/npc_bg/wave.jpg", "res://Assets/npc/avatar/protag.png")
