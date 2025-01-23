extends Control

var mapSelectContainer : PanelContainer

func _on_quit_button_pressed():
	get_tree().quit()

func _on_start_button_pressed():
	if not mapSelectContainer:
		var mscScene := preload("res://Scenes/ui/mainMenu/select_map_container.tscn")
		var msc := mscScene.instantiate()
		mapSelectContainer = msc
		add_child(msc)

func _ready():
	if Maiky:
		print("Maiky class found!")
		var maiky_instance = Maiky.new()
		if maiky_instance:
			print("Maiky instance created successfully.")
			add_child(maiky_instance)
			maiky_instance.show_message("Welcome to Tower Defense!")
			#maiky_instance.update_score(0)
		else:
			print("Failed to create Maiky instance.")
	else:
		print("Maiky class not found.")

	if MusicManager:
		print("MusicManager class found!")
		var music_manager = MusicManager.new()
		if music_manager:
			print("MusicManager instance was created!")
			add_child(music_manager)
			music_manager.load_music("res://audio/track1.ogg")
		else:
			print("MusicManager instance failed to be created!")
	else:
		print("MusicManager not found.")
