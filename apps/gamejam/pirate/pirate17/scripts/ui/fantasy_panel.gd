class_name FantasyPanel
extends Control

@export var panel_texture_path: String = "res://assets/ui/fantasy/RectangleBox_96x96.png"
@export var title_text: String = "" : set = set_title_text
@export var title_texture_path: String = "res://assets/ui/fantasy/TitleBox_64x16.png"

var background_panel: NinePatchRect
var title_panel: NinePatchRect
var title_label: Label
var content_container: Control

func _ready():
	setup_background()
	if title_text != "":
		setup_title()
	setup_content_container()

func setup_background():
	background_panel = NinePatchRect.new()
	background_panel.texture = load(panel_texture_path)
	background_panel.anchors_preset = Control.PRESET_FULL_RECT
	
	# Set nine-patch margins for proper stretching
	background_panel.patch_margin_left = 16
	background_panel.patch_margin_right = 16
	background_panel.patch_margin_top = 16
	background_panel.patch_margin_bottom = 16
	
	add_child(background_panel)

func setup_title():
	# Create title background
	title_panel = NinePatchRect.new()
	title_panel.texture = load(title_texture_path)
	title_panel.anchors_preset = Control.PRESET_TOP_WIDE
	title_panel.offset_left = 20
	title_panel.offset_right = -20
	title_panel.offset_top = -8
	title_panel.offset_bottom = 24
	
	title_panel.patch_margin_left = 8
	title_panel.patch_margin_right = 8
	title_panel.patch_margin_top = 4
	title_panel.patch_margin_bottom = 4
	
	add_child(title_panel)
	
	# Create title label
	title_label = Label.new()
	title_label.text = title_text
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 14)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	title_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	title_label.add_theme_constant_override("shadow_offset_x", 1)
	title_label.add_theme_constant_override("shadow_offset_y", 1)
	
	title_label.anchors_preset = Control.PRESET_FULL_RECT
	title_panel.add_child(title_label)

func setup_content_container():
	content_container = Control.new()
	content_container.anchors_preset = Control.PRESET_FULL_RECT
	
	# Adjust margins based on whether there's a title
	if title_panel:
		content_container.offset_top = 30
	else:
		content_container.offset_top = 16
	
	content_container.offset_left = 16
	content_container.offset_right = -16
	content_container.offset_bottom = -16
	
	add_child(content_container)

func set_title_text(new_title: String):
	title_text = new_title
	if title_label:
		title_label.text = title_text

func add_content(content: Control):
	if content_container:
		content_container.add_child(content)

func get_content_container() -> Control:
	return content_container

func set_panel_size(new_size: Vector2):
	custom_minimum_size = new_size
	size = new_size