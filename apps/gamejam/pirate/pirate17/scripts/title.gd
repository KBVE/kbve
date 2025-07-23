extends Control

const FantasyMenu = preload("res://scripts/ui/fantasy_menu.gd")
const FantasyTitle = preload("res://scripts/ui/fantasy_title.gd")
const FantasyPanel = preload("res://scripts/ui/fantasy_panel.gd")

var title_display: FantasyTitle
var main_menu: FantasyMenu
var player_info_panel: FantasyPanel

func _ready():
	print("Title scene _ready() called")
	setup_background()
	
	# Setup UI directly now that signal issue is fixed
	setup_ui_deferred()
	print("Title scene setup complete")

# CloudManager singleton handles all cloud movement and processing

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

func setup_stars_layer(screen_size: Vector2):
	# Load the stars image
	var stars_texture = load("res://assets/background/stars.png")
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
	# Create a continuous shimmer animation with multiple effects
	var shimmer_tween = create_tween()
	shimmer_tween.set_loops()  # Loop indefinitely
	shimmer_tween.set_parallel(true)  # Allow multiple animations at once
	
	# Opacity shimmer - creates a gentle breathing/glowing effect
	var opacity_tween = shimmer_tween.tween_method(
		func(alpha: float): stars_sprite.modulate = Color(1.0, 1.0, 1.0, alpha),
		0.6,  # Start opacity
		1.0,  # End opacity
		2.0   # Duration
	)
	opacity_tween.set_ease(Tween.EASE_IN_OUT)
	opacity_tween.set_trans(Tween.TRANS_SINE)
	
	# Add reverse opacity animation
	var opacity_reverse = shimmer_tween.tween_method(
		func(alpha: float): stars_sprite.modulate = Color(1.0, 1.0, 1.0, alpha),
		1.0,  # Start opacity
		0.6,  # End opacity
		2.0   # Duration
	)
	opacity_reverse.set_ease(Tween.EASE_IN_OUT)
	opacity_reverse.set_trans(Tween.TRANS_SINE)
	opacity_reverse.set_delay(2.0)  # Start after first animation
	
	# Subtle color shimmer - adds a slight blue-white tint variation for starlight
	var color_tween = shimmer_tween.tween_method(
		func(color_val: float): 
			var current_alpha = stars_sprite.modulate.a
			stars_sprite.modulate = Color(1.0, 1.0, color_val, current_alpha),
		0.95,  # Slightly warm
		1.05,  # Slightly cool (more blue)
		3.0    # Slower color change
	)
	color_tween.set_ease(Tween.EASE_IN_OUT)
	color_tween.set_trans(Tween.TRANS_SINE)
	
	# Reverse color animation
	var color_reverse = shimmer_tween.tween_method(
		func(color_val: float): 
			var current_alpha = stars_sprite.modulate.a
			stars_sprite.modulate = Color(1.0, 1.0, color_val, current_alpha),
		1.05,  # Cool
		0.95,  # Warm
		3.0    # Duration
	)
	color_reverse.set_ease(Tween.EASE_IN_OUT)
	color_reverse.set_trans(Tween.TRANS_SINE)
	color_reverse.set_delay(3.0)  # Start after first color animation
	
	print("Title: Stars shimmer animation started")

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

func setup_title_display():
	print("Setting up title display...")
	title_display = FantasyTitle.new()
	title_display.title_text = "Airship Pirate 17"
	title_display.size = Vector2(400, 80)
	title_display.position = Vector2(440, 150)
	add_child(title_display)
	print("Title display added")

func setup_main_menu():
	print("Setting up main menu...")
	main_menu = FantasyMenu.new()
	
	# Position below title
	main_menu.size = Vector2(400, 350)
	main_menu.position = Vector2(440, 250)  # Center position for typical screen
	
	# Connect menu signals
	main_menu.menu_action.connect(_on_menu_action)
	
	# Ensure menu is visible
	main_menu.visible = true
	main_menu.z_index = 1
	
	add_child(main_menu)
	print("Main menu added to scene at position: ", main_menu.position, " size: ", main_menu.size)
	
	# Add buttons to menu
	main_menu.create_main_menu()
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
	
	# Player name
	var name_label = Label.new()
	name_label.text = "Welcome, " + Global.player.player_name + "!"
	name_label.add_theme_font_size_override("font_size", 14)
	name_label.add_theme_color_override("font_color", Color.WHITE)
	name_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	name_label.add_theme_constant_override("shadow_offset_x", 1)
	name_label.add_theme_constant_override("shadow_offset_y", 1)
	info_vbox.add_child(name_label)
	
	# Player ULID (smaller text)
	var ulid_label = Label.new()
	ulid_label.text = "ID: " + Global.player.player_ulid
	ulid_label.add_theme_font_size_override("font_size", 10)
	ulid_label.add_theme_color_override("font_color", Color.LIGHT_GRAY)
	ulid_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	ulid_label.add_theme_constant_override("shadow_offset_x", 1)
	ulid_label.add_theme_constant_override("shadow_offset_y", 1)
	info_vbox.add_child(ulid_label)
	
	# Player stats preview
	var stats_label = Label.new()
	stats_label.text = "Health: " + str(Global.player.stats.health) + "/" + str(Global.player.stats.max_health)
	stats_label.add_theme_font_size_override("font_size", 12)
	stats_label.add_theme_color_override("font_color", Color.LIGHT_GREEN)
	stats_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	stats_label.add_theme_constant_override("shadow_offset_x", 1)
	stats_label.add_theme_constant_override("shadow_offset_y", 1)
	info_vbox.add_child(stats_label)
	
	content_container.add_child(info_vbox)

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"start_game":
			get_tree().change_scene_to_file("res://scenes/main.tscn")
		"settings":
			print("Settings menu not implemented yet")
		"quit_game":
			get_tree().quit()
