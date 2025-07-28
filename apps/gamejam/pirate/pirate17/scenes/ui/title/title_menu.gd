extends Control

@onready var play_button = $MenuContainer/MenuButtons/PlayButton
@onready var continue_button = $MenuContainer/MenuButtons/ContinueButton
@onready var settings_button = $MenuContainer/MenuButtons/SettingsButton
@onready var credits_button = $MenuContainer/MenuButtons/CreditsButton
@onready var quit_button = $MenuContainer/MenuButtons/QuitButton

signal menu_action(action: String, data: Dictionary)

func _ready():
	if play_button:
		play_button.pressed.connect(_on_play_pressed)
	if continue_button:
		continue_button.pressed.connect(_on_continue_pressed)
	if settings_button:
		settings_button.pressed.connect(_on_settings_pressed)
	if credits_button:
		credits_button.pressed.connect(_on_credits_pressed)
	if quit_button:
		quit_button.pressed.connect(_on_quit_pressed)



func play_confirm_sfx():
	var music_player = get_node_or_null("/root/MusicPlayerAutoload")
	if music_player:
		music_player.play_sfx("confirm")

func _on_play_pressed():
	play_confirm_sfx()
	menu_action.emit("play", {})

func _on_continue_pressed():
	play_confirm_sfx()
	menu_action.emit("continue", {})

func _on_settings_pressed():
	play_confirm_sfx()
	menu_action.emit("settings", {})

func _on_credits_pressed():
	play_confirm_sfx()
	menu_action.emit("credits", {})

func _on_quit_pressed():
	play_confirm_sfx()
	menu_action.emit("quit", {})

func update_for_save_state(has_save: bool, player_data: Dictionary = {}):
	if has_save and not player_data.is_empty():
		if play_button:
			play_button.text = "New Game"
		if continue_button:
			var player_name = player_data.get("player_name", "Unknown Captain")
			continue_button.text = "Continue as " + player_name
			continue_button.visible = true
	else:
		if play_button:
			play_button.text = "Start Adventure"
		if continue_button:
			continue_button.visible = false
