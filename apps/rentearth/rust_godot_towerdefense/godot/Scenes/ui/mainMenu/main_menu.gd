extends Node

var mapSelectContainer: Node
var game_manager: GameManager
var music_manager: MusicManager
var ui_manager: Maiky

func _on_quit_button_pressed():
	emit_signal("exit_game")

func _on_start_button_pressed():
	emit_signal("start_game")

func _ready():
	print("Preparing the ready")

	game_manager = TowerDefensePlugin.game_manager
	if game_manager:
		music_manager = game_manager.get_music_manager()
		music_manager.load_music("res://audio/track1.ogg")
		var key = "main_menu"
		var background_image = "res://Assets/menu/bg_main_screen.png"
		var button_image = "res://Assets/menu/button1.png"
		var buttons = [
			{"element_type": "button", "id": "button_1", "properties": {"title": "Start", "callback": "_on_start_game", "params": []}},
			{"element_type": "button", "id": "button_2", "properties": {"title": "Settings", "callback": "_on_open_settings", "params": []}},
			{"element_type": "button", "id": "button_3", "properties": {"title": "Credits", "callback": "_on_show_credits", "params": []}},
			{"element_type": "button", "id": "button_4", "properties": {"title": "Load Scene", "callback": "_on_load_scene", "params": ["res://scenes/game_scene.tscn"]}},
			{"element_type": "button", "id": "button_5", "properties": {"title": "Exit", "callback": "exit_game", "params": []}}
		]
		var buttons_json = JSON.stringify(buttons)
		ui_manager = game_manager.get_ui_manager()
		ui_manager.show_menu_canvas(key, background_image, button_image, buttons_json)
		ui_manager.show_avatar_message("avatar_1", "The wild fires are spreading all around...", "res://Assets/npc/npc_bg/wave.jpg", "res://Assets/npc/avatar/protag.png")


func _on_start_game():
	print("Start Game signal received")

func _on_open_settings():
	print("Settings signal received")

func _on_show_credits():
	print("Credits signal received")

func _on_load_scene(scene_path):
	print("Loading scene:", scene_path)
	get_tree().change_scene_to_file(scene_path)

func _on_exit_game():
	print("Exit signal received")
	get_tree().quit()
