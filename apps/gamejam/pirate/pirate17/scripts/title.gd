extends Control

## Preloads
const PlayerSaving = preload("res://scripts/player/player_saving.gd")

# UI node references
@onready var title_menu = $MenuLayer/TitleMenu
@onready var social_container = $SocialLayer/TitleSocial/SocialContainer/SocialButtons
@onready var version_label = $MenuLayer/TitleMenu/VersionLabel
@onready var background_elements = $BackgroundElements

var is_transitioning: bool = false
var saved_player_data: Dictionary = {}
var has_save_file: bool = false

func _ready():
	print("Title scene _ready() called")
	
	# Check for saved player data first
	check_for_saved_data()
	
	# Setup background (sky, stars, clouds)
	setup_background()
	
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
	
	# Connect to menu signal
	title_menu.menu_action.connect(_on_menu_action)

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

# Background setup functions from old title.gd
func setup_background():
	# Load the sky background image
	var texture = load("res://assets/background/sky.png")
	if not texture:
		print("Title: WARNING - Could not load sky.png, using fallback color")
		# Fallback to colored background
		var fallback_bg = ColorRect.new()
		fallback_bg.color = Color(0.4, 0.6, 0.9, 1.0)  # Sky blue fallback
		fallback_bg.anchors_preset = Control.PRESET_FULL_RECT
		fallback_bg.z_index = -1
		add_child(fallback_bg)
		return
	
	print("Title: Sky background texture loaded successfully")
	print("Title: Texture size: ", texture.get_size())
	
	# Use Sprite2D instead of TextureRect for better scaling control
	var background_sprite = Sprite2D.new()
	background_sprite.texture = texture
	background_sprite.z_index = -1  # Put it behind everything
	
	# Get screen size
	var screen_size = get_viewport().get_visible_rect().size
	var texture_size = texture.get_size()
	
	# Calculate scale to cover entire screen
	var scale_x = screen_size.x / texture_size.x
	var scale_y = screen_size.y / texture_size.y
	
	# Position sprite at center of screen
	background_sprite.position = screen_size / 2
	background_sprite.scale = Vector2(scale_x, scale_y)
	
	background_elements.add_child(background_sprite)
	
	print("Title: Background sprite added - Position: ", background_sprite.position, " Scale: ", background_sprite.scale)
	print("Title: Screen size: ", screen_size, " Texture size: ", texture_size)
	
	# Add stars layer above the sky
	setup_stars_layer(screen_size)
	
	# Add clouds layer on top of the stars
	setup_clouds_layer(screen_size)

func setup_stars_layer(screen_size: Vector2):
	# Load the stars image
	var stars_texture = load("res://assets/background/stars.png")

	# Generic Warning.
	if not stars_texture:
		print("Title: WARNING - Could not load stars.png, skipping stars layer")
		return
	
	print("Title: Stars texture loaded successfully")
	print("Title: Stars texture size: ", stars_texture.get_size())
	
	# Create stars sprite
	var stars_sprite = Sprite2D.new()
	stars_sprite.texture = stars_texture
	stars_sprite.z_index = -0.5  # Above sky (-1) but below clouds (0)
	
	# Get stars texture size
	var stars_size = stars_texture.get_size()
	
	# Calculate scale to cover screen width
	var scale_x = screen_size.x / stars_size.x
	var scale_y = scale_x  # Keep aspect ratio
	
	# Position stars at the top of the screen
	stars_sprite.position = Vector2(screen_size.x / 2, stars_size.y * scale_y / 2)
	stars_sprite.scale = Vector2(scale_x, scale_y)
	
	# Make stars slightly transparent for layering effect
	stars_sprite.modulate = Color(1.0, 1.0, 1.0, 0.9)  # 90% opacity
	
	background_elements.add_child(stars_sprite)
	
	# Start shimmer animation
	start_stars_shimmer_animation(stars_sprite)
	
	print("Title: Stars sprite added - Position: ", stars_sprite.position, " Scale: ", stars_sprite.scale)

func start_stars_shimmer_animation(stars_sprite: Sprite2D):
	# Create a more noticeable shimmer animation with enhanced effects
	var shimmer_tween = create_tween()
	shimmer_tween.set_loops()  # Loop indefinitely
	shimmer_tween.set_parallel(true)  # Allow multiple animations at once
	
	# More dramatic opacity shimmer - creates a stronger breathing/glowing effect
	var opacity_tween = shimmer_tween.tween_method(
		func(alpha: float): stars_sprite.modulate = Color(1.0, 1.0, 1.0, alpha),
		0.3,  # Much lower start opacity for more dramatic effect
		1.0,  # Full brightness
		1.5   # Faster duration for more noticeable pulse
	)
	opacity_tween.set_ease(Tween.EASE_IN_OUT)
	opacity_tween.set_trans(Tween.TRANS_CUBIC)  # More dramatic curve
	
	# Add reverse opacity animation
	var opacity_reverse = shimmer_tween.tween_method(
		func(alpha: float): stars_sprite.modulate = Color(1.0, 1.0, 1.0, alpha),
		1.0,  # Full brightness
		0.3,  # Much dimmer
		1.5   # Faster duration
	)
	opacity_reverse.set_ease(Tween.EASE_IN_OUT)
	opacity_reverse.set_trans(Tween.TRANS_CUBIC)
	opacity_reverse.set_delay(1.5)  # Start after first animation
	
	# More noticeable color shimmer - stronger blue-white-yellow tint variation
	var color_tween = shimmer_tween.tween_method(
		func(color_val: float): 
			var current_alpha = stars_sprite.modulate.a
			# Shift between warm yellow and cool blue
			var r = lerp(1.0, 0.8, color_val)
			var g = lerp(1.0, 0.9, color_val)
			var b = lerp(0.8, 1.2, color_val)
			stars_sprite.modulate = Color(r, g, b, current_alpha),
		0.0,  # Start warm/yellow
		1.0,  # End cool/blue
		2.0   # Duration
	)
	color_tween.set_ease(Tween.EASE_IN_OUT)
	color_tween.set_trans(Tween.TRANS_SINE)
	
	# Reverse color animation
	var color_reverse = shimmer_tween.tween_method(
		func(color_val: float): 
			var current_alpha = stars_sprite.modulate.a
			# Shift back from blue to yellow
			var r = lerp(0.8, 1.0, color_val)
			var g = lerp(0.9, 1.0, color_val)
			var b = lerp(1.2, 0.8, color_val)
			stars_sprite.modulate = Color(r, g, b, current_alpha),
		0.0,  # Start cool/blue
		1.0,  # End warm/yellow
		2.0   # Duration
	)
	color_reverse.set_ease(Tween.EASE_IN_OUT)
	color_reverse.set_trans(Tween.TRANS_SINE)
	color_reverse.set_delay(2.0)  # Start after first color animation
	
	print("Title: Enhanced stars shimmer animation started")

func setup_clouds_layer(screen_size: Vector2):
	# Create static clouds background
	create_static_clouds_background(screen_size)
	
	# Configure CloudManager singleton for title scene
	setup_title_cloud_manager()

func create_static_clouds_background(screen_size: Vector2):
	# Load the static clouds.png as background
	var clouds_texture = load("res://assets/background/clouds.png")
	if not clouds_texture:
		print("Title: WARNING - Could not load clouds.png, skipping static clouds layer")
		return
	
	print("Title: Static clouds texture loaded successfully")
	
	# Create static clouds sprite
	var static_clouds = Sprite2D.new()
	static_clouds.texture = clouds_texture
	static_clouds.z_index = 0  # Above stars but below moving clouds
	
	# Get clouds texture size
	var clouds_size = clouds_texture.get_size()
	
	# Calculate scale to cover entire screen
	var scale_x = screen_size.x / clouds_size.x
	var scale_y = screen_size.y / clouds_size.y
	
	# Position at center of screen
	static_clouds.position = screen_size / 2
	static_clouds.scale = Vector2(scale_x, scale_y)
	
	# Make static clouds semi-transparent as base layer
	static_clouds.modulate = Color(1.0, 1.0, 1.0, 0.6)  # 60% opacity
	
	background_elements.add_child(static_clouds)
	
	print("Title: Static clouds background added")

func setup_title_cloud_manager():
	"""Configure CloudManager singleton for the title scene"""
	# CloudManager is already initialized as a singleton
	CloudManager.set_camera_reference(null)  # No camera in title scene
	CloudManager.set_player_reference(null)  # No player in title scene
