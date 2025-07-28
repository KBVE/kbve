extends Control

## Preloads
const PlayerSaving = preload("res://scripts/player/player_saving.gd")

# UI node references
@onready var title_menu = $MenuLayer/TitleMenu
@onready var social_container = $SocialLayer/TitleSocial/SocialContainer/SocialButtons
@onready var version_label = $MenuLayer/TitleMenu/VersionLabel

var is_transitioning: bool = false
var saved_player_data: Dictionary = {}
var has_save_file: bool = false

func _ready():
	print("Title scene _ready() called")
	
	# Check for saved player data first
	check_for_saved_data()
	
	# Connect UI buttons
	setup_menu_connections()
	setup_social_connections()
	
	# Update version display
	update_version_display()
	
	# Update menu based on save state
	update_menu_for_save_state()
	
	print("Title scene setup complete")

func check_for_saved_data():
	"""Check if saved player data exists and load preview info"""
	has_save_file = PlayerSaving.save_exists()
	
	if has_save_file:
		saved_player_data = PlayerSaving.load_player_data()
		if not saved_player_data.is_empty():
			print("Title: Found saved player: ", saved_player_data.get("player_name", "Unknown"))
		else:
			print("Title: Save file exists but couldn't load data")
			has_save_file = false
	else:
		print("Title: No save file found")
		saved_player_data = {}

func setup_menu_connections():
	"""Connect the menu buttons to their actions"""
	if not title_menu:
		print("Error: Could not find title menu")
		return
	
	print("Connecting to title menu signal...")
	print("Title menu node: ", title_menu)
	print("Title menu has menu_action signal: ", title_menu.has_signal("menu_action"))
	
	# Connect to menu signal
	if title_menu.has_signal("menu_action"):
		title_menu.menu_action.connect(_on_menu_action)
		print("Menu signal connected successfully")
	else:
		print("ERROR: menu_action signal not found on title_menu")

func setup_social_connections():
	"""Connect social media buttons"""
	if not social_container:
		print("Error: Could not find social container")
		return
		
	var twitter_button = social_container.get_node_or_null("TwitterButton")
	var discord_button = social_container.get_node_or_null("DiscordButton")
	var github_button = social_container.get_node_or_null("GitHubButton")
	var website_button = social_container.get_node_or_null("WebsiteButton")
	
	if twitter_button:
		twitter_button.pressed.connect(func(): open_external_link("https://twitter.com/kbve"))
	if discord_button:
		discord_button.pressed.connect(func(): open_external_link("https://kbve.com/discord"))
	if github_button:
		github_button.pressed.connect(func(): open_external_link("https://github.com/KBVE/kbve/tree/dev/apps/gamejam/pirate/pirate17"))
	if website_button:
		website_button.pressed.connect(func(): open_external_link("https://kbve.com"))

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
	print("Menu action received: ", action)
	match action:
		"play":
			if has_save_file:
				# Starting new game with existing save - confirm overwrite
				print("Starting new game (will overwrite existing save)")
				if PlayerSaving.delete_save_files():
					print("Save files deleted successfully")
				else:
					print("Warning: Could not delete all save files")
			smooth_transition_to_scene("res://scenes/main.tscn")
		"continue":
			print("Continuing game as: ", saved_player_data.get("player_name", "Unknown"))
			smooth_transition_to_scene("res://scenes/main.tscn")
		"settings":
			open_settings_dialogue()
		"credits":
			print("Credits button pressed - TODO: Implement credits scene")
			# TODO: Implement credits scene or dialog
		"quit":
			get_tree().quit()

func smooth_transition_to_scene(scene_path: String):
	"""Perform a smooth transition using dedicated transition scene"""
	if is_transitioning:
		return  # Prevent multiple transitions
		
	is_transitioning = true
	print("Starting transition to: ", scene_path)
	
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
	print("Settings menu closed")

func open_external_link(url: String):
	"""Open URL in default web browser - handles both desktop and web builds"""
	print("Opening external link: ", url)
	
	# Check if running in HTML5/Web environment
	if OS.has_feature("web"):
		# Use JavaScript to open URL in new tab for web builds
		JavaScriptBridge.eval("""
			window.open('%s', '_blank');
		""" % url)
	else:
		# Use OS shell_open for desktop builds
		OS.shell_open(url)
