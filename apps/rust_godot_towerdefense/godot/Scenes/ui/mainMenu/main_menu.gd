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

	if HexGridScene:
		print("HexGridScene class found!")
		var hex_grid = HexGridScene.new()
		if hex_grid:
			print("Hexgrid instance was created!")
		else:
			print("Hexgrid instance failed to be created!")
	else:
		print("HexGridScene not found.")
