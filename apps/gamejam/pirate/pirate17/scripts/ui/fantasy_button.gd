class_name FantasyButton
extends TextureButton

signal button_clicked(button_name: String)

@export var button_text: String = "" : set = set_button_text
@export var button_name: String = ""
@export var font_size: int = 12

var normal_texture_path: String
var highlight_texture_path: String
var pressed_texture_path: String

var button_label: Label

func _ready():
	# Load default textures
	set_default_textures()
	
	# Set button properties for better appearance
	stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	
	# Add background color for better visibility
	modulate = Color(1.2, 1.2, 1.2, 1.0)  # Slight brightening
	
	# Create label for button text
	create_button_label()
	
	# Connect signals
	pressed.connect(_on_button_pressed)
	mouse_entered.connect(_on_mouse_entered)
	mouse_exited.connect(_on_mouse_exited)

func set_default_textures():
	normal_texture_path = "res://assets/ui/fantasy/Button_52x14.png"
	highlight_texture_path = "res://assets/ui/fantasy/HighlightButton_60x23.png"
	pressed_texture_path = "res://assets/ui/fantasy/Button_52x14.png"
	
	texture_normal = load(normal_texture_path)
	texture_hover = load(highlight_texture_path)
	texture_pressed = load(pressed_texture_path)
	
	# Set button size with better minimum dimensions
	if texture_normal:
		var tex_size = texture_normal.get_size()
		# Ensure minimum button size for better visibility
		custom_minimum_size = Vector2(max(tex_size.x * 2, 120), max(tex_size.y * 2, 40))

func create_button_label():
	button_label = Label.new()
	button_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	button_label.add_theme_font_size_override("font_size", font_size)
	button_label.add_theme_color_override("font_color", Color.WHITE)
	button_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	button_label.add_theme_constant_override("shadow_offset_x", 2)
	button_label.add_theme_constant_override("shadow_offset_y", 2)
	
	# Make label fill the button
	button_label.anchors_preset = Control.PRESET_FULL_RECT
	button_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	add_child(button_label)
	
	if button_text:
		button_label.text = button_text

func set_button_text(new_text: String):
	button_text = new_text
	if button_label:
		button_label.text = button_text

func set_custom_textures(normal_path: String, hover_path: String = "", pressed_path: String = ""):
	normal_texture_path = normal_path
	texture_normal = load(normal_texture_path)
	
	if hover_path != "":
		highlight_texture_path = hover_path
		texture_hover = load(highlight_texture_path)
	
	if pressed_path != "":
		pressed_texture_path = pressed_path
		texture_pressed = load(pressed_texture_path)
	
	if texture_normal:
		var tex_size = texture_normal.get_size()
		custom_minimum_size = Vector2(max(tex_size.x * 2, 120), max(tex_size.y * 2, 40))

func _on_button_pressed():
	button_clicked.emit(button_name)

func _on_mouse_entered():
	# Scale up slightly on hover
	var tween = create_tween()
	tween.tween_property(self, "scale", Vector2(1.05, 1.05), 0.1)

func _on_mouse_exited():
	# Scale back to normal
	var tween = create_tween()
	tween.tween_property(self, "scale", Vector2.ONE, 0.1)

# Predefined button styles
func set_large_button_style():
	set_custom_textures(
		"res://assets/ui/fantasy/HighlightButton_60x23.png",
		"res://assets/ui/fantasy/HighlightButton_60x23.png",
		"res://assets/ui/fantasy/Button_52x14.png"
	)
	font_size = 16
	modulate = Color(1.3, 1.3, 1.3, 1.0)  # Brighter for large buttons
	if button_label:
		button_label.add_theme_font_size_override("font_size", font_size)

func set_menu_button_style():
	set_custom_textures(
		"res://assets/ui/fantasy/MenusBox_34x34.png",
		"res://assets/ui/fantasy/MenusBox_34x34.png",
		"res://assets/ui/fantasy/MenusBox_34x34.png"
	)
	font_size = 10
	if button_label:
		button_label.add_theme_font_size_override("font_size", font_size)
