extends Control

@onready var player_name_label = $VBoxContainer/PlayerNameLabel
@onready var player_ulid_label = $VBoxContainer/PlayerUlidLabel

func _ready():
	player_name_label.text = "Welcome, " + Global.player_name + "!"
	player_ulid_label.text = "ULID: " + Global.player_ulid

func _on_start_button_pressed():
	get_tree().change_scene_to_file("res://scenes/main.tscn")

func _on_quit_button_pressed():
	get_tree().quit()
