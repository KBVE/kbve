extends Control

var mapSelectContainer : Node
var music_manager: MusicManager
var maiky: Maiky

func _on_quit_button_pressed():
	get_tree().quit()

func _on_start_button_pressed():
	# if not mapSelectContainer:
	# 	#var mscScene := preload("res://Scenes/ui/mainMenu/select_map_container.tscn")
	# 	var gridScene := preload("res://Scenes/maps/GridMapNode.tscn")
	# 	var gs := gridScene.instantiate()
	# 	mapSelectContainer = gs
	# 	add_child(gs)
	get_tree().change_scene_to_file("res://Scenes/maps/GridMapNode.tscn")

func _ready():
	music_manager = TowerDefensePlugin.music_manager
	if music_manager:
		music_manager.load_music("res://audio/track1.ogg")
	maiky = TowerDefensePlugin.maiky
	if maiky:
		maiky.show_message("Welcome to Tower Defense!")
		maiky.show_avatar_message("[outline=#000000 outline_size=4][size=72]The fires are everywhere!![/size][/outline]", "res://Assets/npc/npc_bg/wave.png", "res://Assets/npc/avatar/protag.png")
