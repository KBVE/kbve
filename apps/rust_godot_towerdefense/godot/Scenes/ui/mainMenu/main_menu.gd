extends Control

signal start_game
signal open_settings
signal show_credits
signal load_scene(scene_path)
signal exit_game

var mapSelectContainer: Node
var music_manager: MusicManager
var maiky: Maiky

func _on_quit_button_pressed():
	emit_signal("exit_game")

func _on_start_button_pressed():
	emit_signal("start_game")

func _ready():
	music_manager = TowerDefensePlugin.music_manager
	if music_manager:
		music_manager.load_music("res://audio/track1.ogg")

	connect("start_game", Callable(self, "_on_start_game"))
	connect("open_settings", Callable(self, "_on_open_settings"))
	connect("show_credits", Callable(self, "_on_show_credits"))
	connect("load_scene", Callable(self, "_on_load_scene"))
	connect("exit_game", Callable(self, "_on_exit_game"))
	
	maiky = TowerDefensePlugin.maiky
	if maiky:
		maiky.show_avatar_message("1", "The wild fires are spreading all around...", "res://Assets/npc/npc_bg/wave.jpg", "res://Assets/npc/avatar/protag.png")

		var key = "main_menu"
		var background_image = "res://Assets/menu/bg_main_screen.png"
		var button_image = "res://Assets/menu/button1.png"
		var buttons = [
			{"element_type": "button", "id": "button_1", "properties": {"title": "Start", "callback": "start_game", "params": []}},
			{"element_type": "button", "id": "button_2", "properties": {"title": "Settings", "callback": "open_settings", "params": []}},
			{"element_type": "button", "id": "button_3", "properties": {"title": "Credits", "callback": "show_credits", "params": []}},
			{"element_type": "button", "id": "button_4", "properties": {"title": "Load Scene", "callback": "load_scene", "params": ["res://scenes/game_scene.tscn"]}},
			{"element_type": "button", "id": "button_5", "properties": {"title": "Exit", "callback": "exit_game", "params": []}}
		]
		var buttons_json = JSON.stringify(buttons)
		maiky.show_menu_canvas(key, background_image, button_image, buttons_json)

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
