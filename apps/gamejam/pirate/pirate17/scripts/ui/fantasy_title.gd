class_name FantasyTitle
extends Control

@export var title_text: String = "" : set = set_title_text
@export var title_background_path: String = "res://assets/ui/fantasy/TitleBox_64x16.png"

var title_label: Label
var title_background: NinePatchRect

func _ready():
	setup_title()
	resized.connect(_on_resized)

func setup_title():
	# Create title label first
	title_label = Label.new()
	title_label.text = title_text
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 32)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	title_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	title_label.add_theme_constant_override("shadow_offset_x", 3)
	title_label.add_theme_constant_override("shadow_offset_y", 3)
	title_label.anchors_preset = Control.PRESET_FULL_RECT
	title_label.offset_left = 40
	title_label.offset_right = -40
	title_label.offset_top = 15
	title_label.offset_bottom = -15
	add_child(title_label)
	
	# Create title background and force it to match our size
	title_background = NinePatchRect.new()
	title_background.texture = load(title_background_path)
	title_background.size = size
	title_background.position = Vector2.ZERO
	title_background.patch_margin_left = 32
	title_background.patch_margin_right = 32
	title_background.patch_margin_top = 8
	title_background.patch_margin_bottom = 8
	add_child(title_background)
	move_child(title_background, 0)  # Move behind label

func _on_resized():
	if title_background:
		title_background.size = size

func set_title_text(new_text: String):
	title_text = new_text
	if title_label and is_inside_tree():
		title_label.text = title_text