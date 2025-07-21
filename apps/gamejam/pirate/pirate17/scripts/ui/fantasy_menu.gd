class_name FantasyMenu
extends Control

const FantasyButton = preload("res://scripts/ui/fantasy_button.gd")

signal menu_action(action: String, data: Dictionary)

@export var background_texture_path: String = "res://assets/ui/fantasy/RectangleBox_96x96.png"

var button_container: VBoxContainer
var main_background: NinePatchRect

func _ready():
	setup_menu_structure()
	resized.connect(_on_resized)

func setup_menu_structure():
	# Create button container first
	button_container = VBoxContainer.new()
	button_container.anchors_preset = Control.PRESET_FULL_RECT
	button_container.add_theme_constant_override("separation", 25)
	button_container.alignment = BoxContainer.ALIGNMENT_CENTER
	button_container.offset_left = 50
	button_container.offset_right = -50
	button_container.offset_top = 50
	button_container.offset_bottom = -50
	add_child(button_container)
	
	# Create background and force it to match our size
	main_background = NinePatchRect.new()
	main_background.texture = load(background_texture_path)
	main_background.size = size
	main_background.position = Vector2.ZERO
	main_background.patch_margin_left = 32
	main_background.patch_margin_right = 32
	main_background.patch_margin_top = 32
	main_background.patch_margin_bottom = 32
	add_child(main_background)
	move_child(main_background, 0)  # Move behind buttons

func add_button(text: String, action: String, button_data: Dictionary = {}):
	var button = FantasyButton.new()
	button.button_text = text
	button.button_name = action
	
	# Connect button signal directly to our handler
	button.button_clicked.connect(_on_button_clicked.bind(action, button_data))
	
	button_container.add_child(button)
	return button

func add_large_button(text: String, action: String, button_data: Dictionary = {}):
	var button = add_button(text, action, button_data)
	button.set_large_button_style()
	return button

func add_menu_button(text: String, action: String, button_data: Dictionary = {}):
	var button = add_button(text, action, button_data)
	button.set_menu_button_style()
	return button

func _on_button_clicked(_button_name: String, action: String, button_data: Dictionary):
	menu_action.emit(action, button_data)

func show_menu():
	visible = true
	# Optional: Add fade-in animation
	modulate = Color.TRANSPARENT
	var tween = create_tween()
	tween.tween_property(self, "modulate", Color.WHITE, 0.3)

func hide_menu():
	# Optional: Add fade-out animation
	var tween = create_tween()
	tween.tween_property(self, "modulate", Color.TRANSPARENT, 0.2)
	await tween.finished
	visible = false

func clear_buttons():
	if button_container:
		for child in button_container.get_children():
			child.queue_free()

# Predefined menu layouts
func create_main_menu():
	clear_buttons()
	add_large_button("Start Game", "start_game")
	add_large_button("Settings", "settings")
	add_large_button("Quit", "quit_game")

func create_pause_menu():
	clear_buttons()
	add_button("Resume", "resume")
	add_button("Settings", "settings")
	add_button("Main Menu", "main_menu")
	add_button("Quit", "quit_game")

func create_settings_menu():
	clear_buttons()
	add_button("Audio", "audio_settings")
	add_button("Video", "video_settings")
	add_button("Controls", "control_settings")
	add_button("Back", "back")

func _on_resized():
	if main_background:
		main_background.size = size
