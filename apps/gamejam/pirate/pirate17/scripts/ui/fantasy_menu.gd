class_name FantasyMenu
extends Control

const FantasyButton = preload("res://scripts/ui/fantasy_button.gd")

signal menu_action(action: String, data: Dictionary)

@export var menu_title: String = "" : set = set_menu_title
@export var background_texture_path: String = "res://assets/ui/fantasy/RectangleBox_96x96.png"

var title_container: Control
var title_label: Label
var title_background: NinePatchRect
var content_container: Control
var content_background: NinePatchRect
var button_container: VBoxContainer

func _ready():
	setup_menu_structure()

func setup_menu_structure():
	# Main vertical container for all menu elements
	var main_vbox = VBoxContainer.new()
	main_vbox.anchors_preset = Control.PRESET_FULL_RECT
	main_vbox.add_theme_constant_override("separation", 20)
	add_child(main_vbox)
	
	# Setup title container if title exists
	if menu_title != "":
		setup_title_container(main_vbox)
	
	# Setup content container for buttons
	setup_content_container(main_vbox)

func setup_title_container(parent: Node):
	# Create title container
	title_container = Control.new()
	title_container.custom_minimum_size = Vector2(0, 80)
	parent.add_child(title_container)
	
	# Title background
	title_background = NinePatchRect.new()
	title_background.texture = load("res://assets/ui/fantasy/TitleBox_64x16.png")
	title_background.anchors_preset = Control.PRESET_CENTER
	title_background.size = Vector2(350, 60)
	title_background.position = Vector2(-175, -30)
	title_background.patch_margin_left = 16
	title_background.patch_margin_right = 16
	title_background.patch_margin_top = 4
	title_background.patch_margin_bottom = 4
	title_container.add_child(title_background)
	
	# Title label
	title_label = Label.new()
	title_label.text = menu_title
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 28)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	title_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	title_label.add_theme_constant_override("shadow_offset_x", 2)
	title_label.add_theme_constant_override("shadow_offset_y", 2)
	title_label.anchors_preset = Control.PRESET_FULL_RECT
	title_background.add_child(title_label)

func setup_content_container(parent: Node):
	# Create content container
	content_container = Control.new()
	content_container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	parent.add_child(content_container)
	
	# Content background
	content_background = NinePatchRect.new()
	content_background.texture = load(background_texture_path)
	content_background.anchors_preset = Control.PRESET_FULL_RECT
	content_background.patch_margin_left = 32
	content_background.patch_margin_right = 32
	content_background.patch_margin_top = 32
	content_background.patch_margin_bottom = 32
	content_container.add_child(content_background)
	
	# Button container
	button_container = VBoxContainer.new()
	button_container.anchors_preset = Control.PRESET_CENTER
	button_container.add_theme_constant_override("separation", 20)
	button_container.alignment = BoxContainer.ALIGNMENT_CENTER
	content_container.add_child(button_container)

func set_menu_title(new_title: String):
	menu_title = new_title
	if title_label and is_inside_tree():
		title_label.text = menu_title

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
