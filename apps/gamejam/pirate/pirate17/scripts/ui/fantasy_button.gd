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
var background_fill: ColorRect
var corner_decorations: Control

func _ready():
	# Create solid background first
	create_solid_background()
	
	# Load decorative corner textures
	set_default_textures()
	
	# Set button properties for better appearance
	stretch_mode = TextureButton.STRETCH_SCALE
	
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
	
	# Set button size with better minimum dimensions and window scaling
	if texture_normal:
		var tex_size = texture_normal.get_size()
		var window_scale = get_window_scale()
		var scaled_size = Vector2(
			max(tex_size.x * 4 * window_scale, 200 * window_scale), 
			max(tex_size.y * 4 * window_scale, 60 * window_scale)
		)
		
		# Ensure button stretches to cover full texture area
		set_anchors_preset(Control.PRESET_TOP_LEFT)
		set_size(scaled_size)
		custom_minimum_size = scaled_size
		size_flags_horizontal = Control.SIZE_FILL
		size_flags_vertical = Control.SIZE_FILL

func create_solid_background():
	background_fill = ColorRect.new()
	# Rich brown background like in the goal image
	background_fill.color = Color(0.45, 0.32, 0.22, 1.0)  # Rich brown
	background_fill.anchors_preset = Control.PRESET_FULL_RECT
	background_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	background_fill.z_index = -2  # Behind everything
	add_child(background_fill)

func create_button_label():
	button_label = Label.new()
	button_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var window_scale = get_window_scale()
	button_label.add_theme_font_size_override("font_size", int(font_size * window_scale))
	# High contrast white text for readability
	button_label.add_theme_color_override("font_color", Color.WHITE)
	# Strong black shadow for better contrast
	button_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	button_label.add_theme_constant_override("shadow_offset_x", int(3 * window_scale))
	button_label.add_theme_constant_override("shadow_offset_y", int(3 * window_scale))
	
	# Make label fill the button
	button_label.anchors_preset = Control.PRESET_FULL_RECT
	button_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button_label.z_index = 1  # Ensure label is on top
	
	add_child(button_label)
	self.z_index = -1  # Decorative corners above background, below text
	
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
		var window_scale = get_window_scale()
		var scaled_size = Vector2(max(tex_size.x * 2 * window_scale, 120 * window_scale), max(tex_size.y * 2 * window_scale, 40 * window_scale))
		
		set_anchors_preset(Control.PRESET_TOP_LEFT)
		set_size(scaled_size)
		custom_minimum_size = scaled_size
		size_flags_horizontal = Control.SIZE_FILL
		size_flags_vertical = Control.SIZE_FILL

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
func get_window_scale() -> float:
	# Scale based on window height (720p as baseline)
	var window_height = get_viewport().get_visible_rect().size.y
	return max(window_height / 720.0, 0.5)  # Minimum scale of 0.5

func set_large_button_style():
	set_custom_textures(
		"res://assets/ui/fantasy/HighlightButton_60x23.png",
		"res://assets/ui/fantasy/HighlightButton_60x23.png",
		"res://assets/ui/fantasy/Button_52x14.png"
	)
	var window_scale = get_window_scale()
	font_size = int(20 * window_scale)  # Larger font for bigger buttons
	if background_fill:
		background_fill.color = Color(0.52, 0.38, 0.26, 1.0)  # Slightly brighter brown for large buttons
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
