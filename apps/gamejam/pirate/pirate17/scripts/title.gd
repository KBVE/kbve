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
	# Create a background ColorRect
	var background = ColorRect.new()
	background.color = Color(0.2, 0.15, 0.3, 1.0)  # Dark purple fantasy tone
	background.anchors_preset = Control.PRESET_FULL_RECT
	background.z_index = -1  # Put it behind everything
	add_child(background)

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
