extends Control

## Preloads
const FantasyMenu = preload("res://scripts/ui/fantasy_menu.gd")
const FantasyTitle = preload("res://scripts/ui/fantasy_title.gd")
const FantasyPanel = preload("res://scripts/ui/fantasy_panel.gd")
const PlayerSaving = preload("res://scripts/player/player_saving.gd")

var title_display: FantasyTitle
var main_menu: FantasyMenu
var player_info_panel: FantasyPanel
var is_transitioning: bool = false
var saved_player_data: Dictionary = {}
var has_save_file: bool = false

func _ready():
	print("Title scene _ready() called")
	
	# Check for saved player data first
	check_for_saved_data()
	setup_background()
	# Setup UI directly now that signal issue is fixed
	setup_ui_deferred()
	setup_social_icons()
	setup_version_display()
	print("Title scene setup complete")

func setup_ui_deferred():
	print("Setting up UI deferred...")
	setup_title_display()
	setup_main_menu()
	setup_player_info()

func setup_fallback_ui():
	# Create simple working buttons as fallback
	var button_container = VBoxContainer.new()
	button_container.anchors_preset = Control.PRESET_CENTER
	button_container.add_theme_constant_override("separation", 10)
	button_container.position = Vector2(-75, 50)  # Offset below the loading text
	add_child(button_container)
	
	var start_button = Button.new()
	start_button.text = "Start Game"
	start_button.custom_minimum_size = Vector2(150, 40)
	start_button.pressed.connect(_on_menu_action.bind("start_game", {}))
	button_container.add_child(start_button)
	
	var quit_button = Button.new()
	quit_button.text = "Quit"
	quit_button.custom_minimum_size = Vector2(150, 40)
	quit_button.pressed.connect(_on_menu_action.bind("quit_game", {}))
	button_container.add_child(quit_button)

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
	### TODO: Dynamic check of viewport, maybe a custom class or library.
	var screen_size = get_viewport().get_visible_rect().size
	var texture_size = texture.get_size()
	
	# Calculate scale to cover entire screen
	var scale_x = screen_size.x / texture_size.x
	var scale_y = screen_size.y / texture_size.y
	
	# Position sprite at center of screen
	background_sprite.position = screen_size / 2
	background_sprite.scale = Vector2(scale_x, scale_y)
	
	add_child(background_sprite)
	
	print("Title: Background sprite added - Position: ", background_sprite.position, " Scale: ", background_sprite.scale)
	print("Title: Screen size: ", screen_size, " Texture size: ", texture_size)
	
	# Add stars layer above the sky
	setup_stars_layer(screen_size)
	
	# Add clouds layer on top of the stars
	setup_clouds_layer(screen_size)

### TODO: Major! We need to fix the glimmery or shimmer for the stars.
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
	
	add_child(stars_sprite)
	
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
	# First, create the static clouds.png background
	create_static_clouds_background(screen_size)
	
	# Then configure CloudManager singleton for title scene
	setup_title_cloud_manager()
	
	print("Title: Static clouds background + moving cloud pool layers created")

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
	
	add_child(static_clouds)
	
	print("Title: Static clouds background added")

func setup_title_cloud_manager():
	"""Configure CloudManager singleton for the title scene"""
	# CloudManager is already initialized as a singleton
	# Just configure it for title scene use - no camera reference needed for title
	CloudManager.set_camera_reference(null)  # No camera in title scene
	CloudManager.set_player_reference(null)  # No player in title scene
	
	print("Title: CloudManager singleton configured for title scene")

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

func create_dynamic_main_menu():
	"""Create main menu with different options based on save state"""
	main_menu.clear_buttons()
	
	if has_save_file and not saved_player_data.is_empty():
		# Show continue option with player name
		var player_name = saved_player_data.get("player_name", "Unknown Captain")
		var continue_text = "Continue as " + player_name
		main_menu.add_large_button(continue_text, "continue_game")
		main_menu.add_large_button("New Game", "new_game")
	else:
		# No save file, just show start game
		main_menu.add_large_button("Start Game", "start_game")
	
	main_menu.add_large_button("Settings", "settings")
	main_menu.add_large_button("Quit", "quit_game")

func setup_title_display():
	print("Setting up title display...")
	
	# Add logo above the title
	setup_logo_display()
	
	title_display = FantasyTitle.new()
	title_display.title_text = "Airship Pirate 17"
	title_display.size = Vector2(400, 80)
	title_display.position = Vector2(440, 250)  # Moved down to make room for logo
	add_child(title_display)
	print("Title display added")

func setup_logo_display():
	"""Setup the airship logo above the title"""
	var logo_texture = load("res://assets/ui/logo_airship.png")
	if not logo_texture:
		print("Title: WARNING - Could not load logo_airship.png")
		return
	
	# Create logo sprite
	var logo_sprite = Sprite2D.new()
	logo_sprite.texture = logo_texture
	logo_sprite.z_index = 10  # Above background but below UI
	
	# Get screen size for positioning
	var screen_size = get_viewport().get_visible_rect().size
	
	# Position logo centered horizontally, near top of screen
	logo_sprite.position = Vector2(screen_size.x / 2, 120)
	
	# Scale logo appropriately (adjust as needed)
	var logo_scale = 0.5  # Adjust this value to make logo bigger/smaller
	logo_sprite.scale = Vector2(logo_scale, logo_scale)
	
	# Add subtle animation to the logo
	add_child(logo_sprite)
	start_logo_animation(logo_sprite)
	
	print("Title: Logo display added")

func start_logo_animation(logo_sprite: Sprite2D):
	"""Add subtle floating animation to the logo"""
	var float_tween = create_tween()
	float_tween.set_loops()  # Loop indefinitely
	float_tween.set_trans(Tween.TRANS_SINE)
	float_tween.set_ease(Tween.EASE_IN_OUT)
	
	# Subtle vertical floating motion
	var original_y = logo_sprite.position.y
	float_tween.tween_property(logo_sprite, "position:y", original_y - 10, 2.0)
	float_tween.tween_property(logo_sprite, "position:y", original_y, 2.0)
	
	# Add subtle rotation animation
	var rotation_tween = create_tween()
	rotation_tween.set_loops()
	rotation_tween.set_trans(Tween.TRANS_SINE)
	rotation_tween.set_ease(Tween.EASE_IN_OUT)
	
	rotation_tween.tween_property(logo_sprite, "rotation", deg_to_rad(-3), 3.0)
	rotation_tween.tween_property(logo_sprite, "rotation", deg_to_rad(3), 3.0)

func setup_main_menu():
	print("Setting up main menu...")
	main_menu = FantasyMenu.new()
	
	# Position below title (which is now lower due to logo)
	main_menu.size = Vector2(400, 350)
	main_menu.position = Vector2(440, 350)  # Moved down to accommodate logo and title
	
	# Connect menu signals
	main_menu.menu_action.connect(_on_menu_action)
	
	# Ensure menu is visible
	main_menu.visible = true
	main_menu.z_index = 1
	
	add_child(main_menu)
	print("Main menu added to scene at position: ", main_menu.position, " size: ", main_menu.size)
	
	# Add buttons to menu based on save state
	create_dynamic_main_menu()
	print("Buttons added to menu")
	
	# Debug: print menu visibility
	print("Menu visible: ", main_menu.visible)
	print("Menu children count: ", main_menu.get_child_count())

func setup_player_info():
	player_info_panel = FantasyPanel.new()
	player_info_panel.title_text = "Captain Information"
	player_info_panel.anchors_preset = Control.PRESET_BOTTOM_RIGHT
	player_info_panel.custom_minimum_size = Vector2(300, 150)
	player_info_panel.position = Vector2(-320, -170)
	
	add_child(player_info_panel)
	
	# Add player info content
	var content_container = player_info_panel.get_content_container()
	
	var info_vbox = VBoxContainer.new()
	info_vbox.add_theme_constant_override("separation", 8)
	
	# Show info based on whether we have a saved player or not
	if has_save_file and not saved_player_data.is_empty():
		# Show saved player info
		setup_saved_player_info(info_vbox)
	else:
		# Show default/new player message
		setup_new_player_info(info_vbox)
	
	content_container.add_child(info_vbox)

func setup_saved_player_info(container: VBoxContainer):
	"""Setup info panel for saved player"""
	var player_name = saved_player_data.get("player_name", "Unknown Captain")
	var player_ulid = saved_player_data.get("player_ulid", "UNKNOWN")
	var stats_data = saved_player_data.get("stats", {})
	var play_time = saved_player_data.get("play_time", 0.0)
	
	# Player name
	var name_label = Label.new()
	name_label.text = "Welcome back, " + player_name + "!"
	name_label.add_theme_font_size_override("font_size", 14)
	name_label.add_theme_color_override("font_color", Color.WHITE)
	name_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	name_label.add_theme_constant_override("shadow_offset_x", 1)
	name_label.add_theme_constant_override("shadow_offset_y", 1)
	container.add_child(name_label)
	
	# Player ULID (smaller text)
	var ulid_label = Label.new()
	ulid_label.text = "ID: " + player_ulid
	ulid_label.add_theme_font_size_override("font_size", 10)
	ulid_label.add_theme_color_override("font_color", Color.LIGHT_GRAY)
	ulid_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	ulid_label.add_theme_constant_override("shadow_offset_x", 1)
	ulid_label.add_theme_constant_override("shadow_offset_y", 1)
	container.add_child(ulid_label)
	
	# Player stats preview
	var health = stats_data.get("health", 100)
	var max_health = stats_data.get("max_health", 100)
	var stats_label = Label.new()
	stats_label.text = "Health: " + str(health) + "/" + str(max_health)
	stats_label.add_theme_font_size_override("font_size", 12)
	stats_label.add_theme_color_override("font_color", Color.LIGHT_GREEN)
	stats_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	stats_label.add_theme_constant_override("shadow_offset_x", 1)
	stats_label.add_theme_constant_override("shadow_offset_y", 1)
	container.add_child(stats_label)
	
	# Play time
	var total_seconds = int(play_time)
	var hours = total_seconds / 3600
	var minutes = (total_seconds % 3600) / 60
	var time_label = Label.new()
	time_label.text = "Play Time: " + str(hours) + "h " + str(minutes) + "m"
	time_label.add_theme_font_size_override("font_size", 10)
	time_label.add_theme_color_override("font_color", Color.LIGHT_BLUE)
	time_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	time_label.add_theme_constant_override("shadow_offset_x", 1)
	time_label.add_theme_constant_override("shadow_offset_y", 1)
	container.add_child(time_label)

func setup_new_player_info(container: VBoxContainer):
	"""Setup info panel for new player"""
	# Welcome message
	var welcome_label = Label.new()
	welcome_label.text = "Welcome, New Captain!"
	welcome_label.add_theme_font_size_override("font_size", 14)
	welcome_label.add_theme_color_override("font_color", Color.WHITE)
	welcome_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	welcome_label.add_theme_constant_override("shadow_offset_x", 1)
	welcome_label.add_theme_constant_override("shadow_offset_y", 1)
	container.add_child(welcome_label)
	
	# Instructions
	var instruction_label = Label.new()
	instruction_label.text = "Begin your pirate adventure!"
	instruction_label.add_theme_font_size_override("font_size", 12)
	instruction_label.add_theme_color_override("font_color", Color.LIGHT_GRAY)
	instruction_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	instruction_label.add_theme_constant_override("shadow_offset_x", 1)
	instruction_label.add_theme_constant_override("shadow_offset_y", 1)
	container.add_child(instruction_label)
	
	# Default stats preview
	var stats_label = Label.new()
	stats_label.text = "Starting Health: 100/100"
	stats_label.add_theme_font_size_override("font_size", 12)
	stats_label.add_theme_color_override("font_color", Color.LIGHT_GREEN)
	stats_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	stats_label.add_theme_constant_override("shadow_offset_x", 1)
	stats_label.add_theme_constant_override("shadow_offset_y", 1)
	container.add_child(stats_label)


func smooth_transition_to_scene(scene_path: String):
	"""Perform a smooth transition using dedicated transition scene"""
	if is_transitioning:
		return  # Prevent multiple transitions
		
	is_transitioning = true
	print("Starting transition to: ", scene_path)
	
	# Disable menu interactions during transition
	if main_menu:
		main_menu.set_process_input(false)
	
	# Store target scene before changing to transition scene
	get_tree().set_meta("transition_target", scene_path)
	
	# Use the dedicated transition scene
	get_tree().change_scene_to_file("res://scenes/transition.tscn")


func _on_menu_action(action: String, data: Dictionary):
	match action:
		"continue_game":
			# Continue with existing save
			print("Continuing game as: ", saved_player_data.get("player_name", "Unknown"))
			smooth_transition_to_scene("res://scenes/main.tscn")
		"start_game":
			# No save exists, start new game
			print("Starting new game")
			smooth_transition_to_scene("res://scenes/main.tscn")
		"new_game":
			# User wants to start over, delete save and start fresh
			print("Starting new game (deleting existing save)")
			if PlayerSaving.delete_save_files():
				print("Save files deleted successfully")
			else:
				print("Warning: Could not delete all save files")
			smooth_transition_to_scene("res://scenes/main.tscn")
		"settings":
			open_settings_dialogue()
		"quit_game":
			get_tree().quit()

func setup_social_icons():
	"""Setup social media and external link icons in the corner"""
	# Create a CanvasLayer to ensure icons are always on top
	var canvas_layer = CanvasLayer.new()
	canvas_layer.layer = 10  # High layer to render on top
	add_child(canvas_layer)
	
	# Create container for icons
	var icons_container = HBoxContainer.new()
	icons_container.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	icons_container.position = Vector2(20, -60)  # Bottom left corner with padding
	icons_container.add_theme_constant_override("separation", 15)
	canvas_layer.add_child(icons_container)
	
	print("Title: Creating social icons container at position: ", icons_container.position)
	
	# Icon configurations
	var icon_configs = [
		{
			"name": "GitHub",
			"icon_path": "res://assets/icons/github.svg",
			"url": "https://github.com/KBVE/kbve/tree/dev/apps/gamejam/pirate/pirate17",
			"tooltip": "View Source Code"
		},
		{
			"name": "Bug Report",
			"icon_path": "res://assets/icons/bugreport.svg",
			"url": "https://github.com/KBVE/kbve/issues/new?template=godot_report.md&title=[Bug]+:+[Godot]+:+[Airship]+",
			"tooltip": "Report a Bug"
		},
		{
			"name": "Discord",
			"icon_path": "res://assets/icons/discord.svg",
			"url": "https://kbve.com/discord",
			"tooltip": "Join our Discord"
		}
	]
	
	# Create each icon button
	for i in range(icon_configs.size()):
		var config = icon_configs[i]
		var icon_button = create_icon_button(config)
		if icon_button:
			icons_container.add_child(icon_button)
			print("Title: Added icon button '", config.name, "' at index ", i)
		else:
			print("Title: Failed to create icon button for ", config.name)
	
	print("Title: Social icons setup complete - Total buttons: ", icons_container.get_child_count())

func create_icon_button(config: Dictionary) -> Control:
	"""Create a clickable icon button"""
	# Use a Panel as container to ensure visibility
	var container = Panel.new()
	container.custom_minimum_size = Vector2(48, 48)
	container.size = Vector2(48, 48)
	
	# Style the panel
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.2, 0.2, 0.2, 0.8)  # Dark background
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	container.add_theme_stylebox_override("panel", style)
	
	# Create the button
	var button = TextureButton.new()
	button.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	button.ignore_texture_size = true  # This allows the texture to be resized
	
	# Set button to fill container with padding
	button.set_anchors_preset(Control.PRESET_FULL_RECT)
	button.offset_left = 4
	button.offset_top = 4
	button.offset_right = -4
	button.offset_bottom = -4
	
	container.add_child(button)
	
	# Try to load the icon
	var icon_texture = load(config.icon_path)
	if icon_texture:
		button.texture_normal = icon_texture
		
		# Make icon white/light colored for visibility on dark background
		button.modulate = Color(0.9, 0.9, 0.9, 1.0)
		
		print("Title: Loaded icon texture for ", config.name)
	else:
		print("Title: WARNING - Could not load icon: ", config.icon_path)
		# Create fallback colored panel for each service
		var fallback_color = Color.WHITE
		match config.name:
			"GitHub":
				fallback_color = Color(0.2, 0.2, 0.2, 1.0)  # Dark gray
			"Bug Report":
				fallback_color = Color(0.8, 0.2, 0.2, 1.0)  # Red
			"Discord":
				fallback_color = Color(0.36, 0.4, 0.95, 1.0)  # Discord blue
		
		style.bg_color = fallback_color
		
		# Add text label
		var label = Label.new()
		label.text = config.name.left(2)  # First 2 letters
		label.add_theme_font_size_override("font_size", 16)
		label.add_theme_color_override("font_color", Color.WHITE)
		label.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
		container.add_child(label)
	
	# Set tooltip
	container.tooltip_text = config.tooltip
	
	# Add hover effects
	container.mouse_entered.connect(func(): 
		style.bg_color = style.bg_color.lightened(0.2)
		container.add_theme_stylebox_override("panel", style)
	)
	container.mouse_exited.connect(func(): 
		if icon_texture:
			style.bg_color = Color(0.2, 0.2, 0.2, 0.8)
		else:
			# Restore original color based on service
			match config.name:
				"GitHub":
					style.bg_color = Color(0.2, 0.2, 0.2, 1.0)
				"Bug Report":
					style.bg_color = Color(0.8, 0.2, 0.2, 1.0)
				"Discord":
					style.bg_color = Color(0.36, 0.4, 0.95, 1.0)
		container.add_theme_stylebox_override("panel", style)
	)
	
	# Connect click event
	button.pressed.connect(func(): open_external_link(config.url))
	
	return container

func setup_version_display():
	"""Display game version in bottom right corner"""
	# Create a CanvasLayer for version display
	var version_canvas = CanvasLayer.new()
	version_canvas.layer = 10  # High layer to render on top
	add_child(version_canvas)
	
	# Create version label
	var version_label = Label.new()
	version_label.text = "v" + Global.GAME_VERSION
	version_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	version_label.position = Vector2(-80, -20)  # Bottom right with padding
	
	# Style the version label
	version_label.add_theme_font_size_override("font_size", 12)
	version_label.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8, 0.9))
	version_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	version_label.add_theme_constant_override("shadow_offset_x", 1)
	version_label.add_theme_constant_override("shadow_offset_y", 1)
	
	version_canvas.add_child(version_label)
	print("Title: Version display added - ", version_label.text)

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
