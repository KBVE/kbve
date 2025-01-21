extends Node

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
