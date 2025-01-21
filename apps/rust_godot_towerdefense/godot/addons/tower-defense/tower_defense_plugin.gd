extends Node

var hud_instance

func _ready():
	var rust_extension = load("res://rust_godot_towerdefense.gdextension")
	if rust_extension:
		print("Rust Tower Defense extension loaded successfully!")

		if Hud in rust_extension:
			hud_instance = rust_extension.Hud.new()
			add_child(hud_instance)
			hud_instance.show_message("Welcome to Tower Defense!")
			hud_instance.update_score(0)
		else:
			print("Hud class not found in the Rust extension.")
	else:
		print("Failed to load Rust Tower Defense extension.")
