extends Control

## Preloads
const PlayerSaving = preload("res://scripts/player/player_saving.gd")

# UI node references
@onready var title_menu = $MenuLayer/TitleMenu
@onready var version_label = $MenuLayer/TitleMenu/VersionLabel

var is_transitioning: bool = false
var saved_player_data: Dictionary = {}
var has_save_file: bool = false

func _ready():
	# Check for saved player data first
	check_for_saved_data()
	
	# Connect UI buttons
	setup_menu_connections()
	
	# Update version display
	update_version_display()
	
	# Update menu based on save state
	update_menu_for_save_state()

func check_for_saved_data():
	"""Check if saved player data exists and load preview info"""
	has_save_file = PlayerSaving.save_exists()
	
	if has_save_file:
		saved_player_data = PlayerSaving.load_player_data()
		if saved_player_data.is_empty():
			has_save_file = false
	else:
		saved_player_data = {}

func setup_menu_connections():
	"""Connect the menu buttons to their actions"""
	if not title_menu:
		return
	
	# Connect to menu signal
	if title_menu.has_signal("menu_action"):
		title_menu.menu_action.connect(_on_menu_action)


func update_version_display():
	"""Update the version label"""
	if version_label:
		version_label.text = "Pirate17 v" + Global.GAME_VERSION

func update_menu_for_save_state():
	"""Update menu buttons based on whether we have a save file"""
	if not title_menu:
		return
	
	title_menu.update_for_save_state(has_save_file, saved_player_data)

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"play":
			if has_save_file:
				# Starting new game with existing save - confirm overwrite
				PlayerSaving.delete_save_files()
			smooth_transition_to_scene("res://scenes/main.tscn")
		"continue":
			smooth_transition_to_scene("res://scenes/main.tscn")
		"settings":
			open_settings_dialogue()
		"credits":
			# TODO: Implement credits scene or dialog
			pass
		"quit":
			get_tree().quit()

func smooth_transition_to_scene(scene_path: String):
	"""Perform a smooth transition using dedicated transition scene"""
	if is_transitioning:
		return  # Prevent multiple transitions
		
	is_transitioning = true
	
	# Disable menu interactions during transition
	if title_menu:
		title_menu.set_process_input(false)
	
	# Store target scene before changing to transition scene
	get_tree().set_meta("transition_target", scene_path)
	
	# Use the dedicated transition scene
	get_tree().change_scene_to_file("res://scenes/transition.tscn")

func open_settings_dialogue():
	"""Open the settings menu using SettingsManager"""
	SettingsManager.open_settings_with_callback(self, _on_settings_closed)

func _on_settings_closed():
	"""Called when settings menu is closed"""
	pass
