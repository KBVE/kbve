class_name FantasyTitle
extends Control

@export var title_text: String = "" : set = set_title_text
@export var title_background_path: String = "res://assets/ui/fantasy/TitleBox_64x16.png"

var title_label: Label
var title_background: NinePatchRect

func _ready():
	setup_title()

func setup_title():
	# Create title background
	title_background = NinePatchRect.new()
	title_background.texture = load(title_background_path)
	title_background.anchors_preset = Control.PRESET_FULL_RECT
	title_background.patch_margin_left = 16
	title_background.patch_margin_right = 16
	title_background.patch_margin_top = 4
	title_background.patch_margin_bottom = 4
	add_child(title_background)
	
	# Create title label
	title_label = Label.new()
	title_label.text = title_text
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 28)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	title_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	title_label.add_theme_constant_override("shadow_offset_x", 2)
	title_label.add_theme_constant_override("shadow_offset_y", 2)
	title_label.anchors_preset = Control.PRESET_FULL_RECT
	title_background.add_child(title_label)

func set_title_text(new_text: String):
	title_text = new_text
	if title_label and is_inside_tree():
		title_label.text = title_text