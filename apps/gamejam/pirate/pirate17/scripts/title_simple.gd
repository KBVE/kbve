extends Control

func _ready():
	print("Simple title scene loading...")
	
	var background = ColorRect.new()
	background.color = Color(0.2, 0.15, 0.3, 1.0)
	background.anchors_preset = Control.PRESET_FULL_RECT
	add_child(background)
	
	var title_label = Label.new()
	title_label.text = "Pirate Adventure"
	title_label.add_theme_font_size_override("font_size", 32)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.anchors_preset = Control.PRESET_TOP_WIDE
	title_label.offset_top = 100
	title_label.offset_bottom = 150
	add_child(title_label)
	
	var button_container = VBoxContainer.new()
	button_container.anchors_preset = Control.PRESET_CENTER
	button_container.add_theme_constant_override("separation", 10)
	add_child(button_container)
	
	var start_button = Button.new()
	start_button.text = "Start Game"
	start_button.custom_minimum_size = Vector2(150, 40)
	start_button.pressed.connect(_on_start_pressed)
	button_container.add_child(start_button)
	
	var quit_button = Button.new()
	quit_button.text = "Quit"
	quit_button.custom_minimum_size = Vector2(150, 40)
	quit_button.pressed.connect(_on_quit_pressed)
	button_container.add_child(quit_button)
	
	print("Simple title scene loaded successfully!")

func _on_start_pressed():
	print("Start button pressed")
	get_tree().change_scene_to_file("res://scenes/main.tscn")

func _on_quit_pressed():
	print("Quit button pressed")
	get_tree().quit()