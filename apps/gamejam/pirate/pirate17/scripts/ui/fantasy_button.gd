class_name FantasyButton
extends MarginContainer

signal button_clicked(button_name: String)

@export var button_text: String = "" : set = set_button_text
@export var button_name: String = ""
@export var font_size: int = 16

var normal_texture_path: String
var highlight_texture_path: String
var pressed_texture_path: String

var background_panel: Panel
var texture_button: TextureButton
var button_label: Label

func _ready():
	# Set container properties
	var window_scale = get_window_scale()
	custom_minimum_size = Vector2(200 * window_scale, 60 * window_scale)
	
	# Create layered button structure
	create_background_panel()
	create_texture_button()
	create_button_label()
	
	# Set default textures
	set_default_textures()

func create_background_panel():
	background_panel = Panel.new()
	background_panel.add_theme_color_override("bg_color", Color(0.45, 0.32, 0.22, 1.0))
	background_panel.anchors_preset = Control.PRESET_FULL_RECT
	background_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background_panel)

func create_texture_button():
	texture_button = TextureButton.new()
	texture_button.anchors_preset = Control.PRESET_FULL_RECT
	texture_button.stretch_mode = TextureButton.STRETCH_SCALE
	texture_button.mouse_filter = Control.MOUSE_FILTER_PASS
	
	# Connect texture button signals to our handlers
	texture_button.pressed.connect(_on_button_pressed)
	texture_button.mouse_entered.connect(_on_mouse_entered)
	texture_button.mouse_exited.connect(_on_mouse_exited)
	
	add_child(texture_button)

func set_default_textures():
	normal_texture_path = "res://assets/ui/fantasy/Button_52x14.png"
	highlight_texture_path = "res://assets/ui/fantasy/HighlightButton_60x23.png"
	pressed_texture_path = "res://assets/ui/fantasy/Button_52x14.png"
	
	if texture_button:
		texture_button.texture_normal = load(normal_texture_path)
		texture_button.texture_hover = load(highlight_texture_path)
		texture_button.texture_pressed = load(pressed_texture_path)

func create_button_label():
	button_label = Label.new()
	button_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	button_label.text = button_text
	button_label.anchors_preset = Control.PRESET_FULL_RECT
	button_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	var window_scale = get_window_scale()
	button_label.add_theme_font_size_override("font_size", int(font_size * window_scale))
	button_label.add_theme_color_override("font_color", Color.WHITE)
	button_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	button_label.add_theme_constant_override("shadow_offset_x", int(2 * window_scale))
	button_label.add_theme_constant_override("shadow_offset_y", int(2 * window_scale))
	
	add_child(button_label)

func set_button_text(new_text: String):
	button_text = new_text
	if button_label:
		button_label.text = button_text

func get_window_scale() -> float:
	var window_height = get_viewport().get_visible_rect().size.y
	return max(window_height / 720.0, 0.5)

func _on_button_pressed():
	button_clicked.emit(button_name)

func _on_mouse_entered():
	var tween = create_tween()
	tween.tween_property(self, "scale", Vector2(1.05, 1.05), 0.1)

func _on_mouse_exited():
	var tween = create_tween()
	tween.tween_property(self, "scale", Vector2.ONE, 0.1)

# Predefined button styles
func set_large_button_style():
	font_size = 20
	if background_panel:
		background_panel.add_theme_color_override("bg_color", Color(0.52, 0.38, 0.26, 1.0))  # Brighter brown for large buttons
	if button_label:
		var window_scale = get_window_scale()
		button_label.add_theme_font_size_override("font_size", int(font_size * window_scale))
