extends Node

var game_manager: GameManager
var music_manager: MusicManager


func _init():
	print("[Q] Initializing...")
	if not game_manager:
		game_manager = GameManager.new()
		game_manager.name = "GameManager"

func _ready():
	if game_manager:
		add_child(game_manager)
		music_manager = game_manager.get_music_manager()
		music_manager.adjust_sfx_volume(-80.0)
		music_manager.adjust_effects_volume(-80.0)
		music_manager.adjust_music_volume(-80.0)
		print("[Q] -> [GM] -> [MusicManager] initialized and added to the scene tree!")
		#game_manager.load_user_settings();
		call_deferred("_load_settings")
		if game_manager.has_method("test_async_node"):
			print("[Q] -> [GM] -> Starting multi-threading test...")
			game_manager.test_async_node()
		else:
			print("[Q] -> ERROR: test_async_node method not found!")

func _process(_delta):
	if game_manager and game_manager.has_method("process_callbacks"):
		game_manager.process_callbacks()

func _load_settings():
	if game_manager == null:
		print("[Q] -> ERROR: game_manager is null!")
		return
	print("[Q] -> [GM] exists, checking for method...")
	if game_manager.has_method("load_user_settings"):
		print("[Q] -> [GM] -> Method exists, calling it now!")
		game_manager.load_user_settings()
	else:
		print("[Q] -> ERROR: Method does NOT exist!")
