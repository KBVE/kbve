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
var border_nine_patch: NinePatchRect
var button_area: Control
var button_label: Label

func _ready():
	var window_scale = get_window_scale()
	custom_minimum_size = Vector2(180 * window_scale, 50 * window_scale)
	
	modulate = Color.WHITE
	add_theme_color_override("bg_color", Color.TRANSPARENT)
	

	create_background_panel()
	create_nine_patch_border()
	create_button_area()
	create_button_label()
	
	set_default_textures()

func create_background_panel():
	background_panel = Panel.new()
	background_panel.add_theme_color_override("bg_color", Color(0.45, 0.32, 0.22, 1.0))
	background_panel.anchors_preset = Control.PRESET_FULL_RECT
	background_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	background_panel.self_modulate = Color.WHITE
	add_child(background_panel)

func create_nine_patch_border():
	border_nine_patch = NinePatchRect.new()
	border_nine_patch.anchors_preset = Control.PRESET_FULL_RECT
	border_nine_patch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	border_nine_patch.patch_margin_left = 10
	border_nine_patch.patch_margin_right = 10
	border_nine_patch.patch_margin_top = 7
	border_nine_patch.patch_margin_bottom = 7
	
	add_child(border_nine_patch)

func create_button_area():
	button_area = Control.new()
	button_area.anchors_preset = Control.PRESET_FULL_RECT
	button_area.mouse_filter = Control.MOUSE_FILTER_PASS
	
	button_area.gui_input.connect(_on_gui_input)
	button_area.mouse_entered.connect(_on_mouse_entered)
	button_area.mouse_exited.connect(_on_mouse_exited)
	
	add_child(button_area)

func set_default_textures():
	normal_texture_path = "res://assets/ui/fantasy/Button_52x14.png"
	highlight_texture_path = "res://assets/ui/fantasy/HighlightButton_60x23.png"
	pressed_texture_path = "res://assets/ui/fantasy/Button_52x14.png"
	
	if border_nine_patch:
		border_nine_patch.texture = load(normal_texture_path)

func _on_gui_input(event: InputEvent):
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			button_clicked.emit(button_name)

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
	button_label.add_theme_constant_override("shadow_offset_x", int(3 * window_scale))
	button_label.add_theme_constant_override("shadow_offset_y", int(3 * window_scale))
	
	button_label.z_index = 10
	
	add_child(button_label)

func set_button_text(new_text: String):
	button_text = new_text
	if button_label:
		button_label.text = button_text

func get_window_scale() -> float:
	var window_height = get_viewport().get_visible_rect().size.y
	return max(window_height / 720.0, 0.5)


func _on_mouse_entered():
	var tween = create_tween()
	tween.tween_property(self, "scale", Vector2(1.1, 1.1), 0.15)
	
	if border_nine_patch:
		border_nine_patch.texture = load(highlight_texture_path)
	
	if background_panel:
		background_panel.add_theme_color_override("bg_color", Color(0.52, 0.38, 0.26, 1.0))

func _on_mouse_exited():
	var tween = create_tween()
	tween.tween_property(self, "scale", Vector2.ONE, 0.15)
	
	if border_nine_patch:
		border_nine_patch.texture = load(normal_texture_path)
	
	if background_panel:
		background_panel.add_theme_color_override("bg_color", Color(0.45, 0.32, 0.22, 1.0))

func set_large_button_style():
	font_size = 20
	if background_panel:
		background_panel.add_theme_color_override("bg_color", Color(0.52, 0.38, 0.26, 1.0))
	if button_label:
		var window_scale = get_window_scale()
		button_label.add_theme_font_size_override("font_size", int(font_size * window_scale))
