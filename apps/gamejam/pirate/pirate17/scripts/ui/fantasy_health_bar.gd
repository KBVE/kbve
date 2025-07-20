class_name FantasyHealthBar
extends Control

@export var bar_type: String = "health" # "health", "mana", "energy"
@export var max_value: int = 100 : set = set_max_value
@export var current_value: int = 100 : set = set_current_value

var background_panel: NinePatchRect
var value_bar: NinePatchRect
var value_label: Label

var bar_textures = {
	"health": "res://assets/ui/fantasy/ValueRed_120x8.png",
	"mana": "res://assets/ui/fantasy/ValueBlue_120x8.png",
	"energy": "res://assets/ui/fantasy/ValueBar_128x16.png"
}

func _ready():
	setup_background()
	setup_value_bar()
	setup_label()
	update_bar()

func setup_background():
	background_panel = NinePatchRect.new()
	background_panel.texture = load("res://assets/ui/fantasy/HealthBarPanel_160x41.png")
	background_panel.anchors_preset = Control.PRESET_FULL_RECT
	
	background_panel.patch_margin_left = 16
	background_panel.patch_margin_right = 16
	background_panel.patch_margin_top = 8
	background_panel.patch_margin_bottom = 8
	
	add_child(background_panel)

func setup_value_bar():
	value_bar = NinePatchRect.new()
	
	# Load appropriate texture based on bar type
	var texture_path = bar_textures.get(bar_type, bar_textures["health"])
	value_bar.texture = load(texture_path)
	
	value_bar.anchors_preset = Control.PRESET_FULL_RECT
	value_bar.offset_left = 20
	value_bar.offset_right = -20
	value_bar.offset_top = 16
	value_bar.offset_bottom = -16
	
	value_bar.patch_margin_left = 4
	value_bar.patch_margin_right = 4
	value_bar.patch_margin_top = 2
	value_bar.patch_margin_bottom = 2
	
	add_child(value_bar)

func setup_label():
	value_label = Label.new()
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	value_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	value_label.add_theme_font_size_override("font_size", 12)
	value_label.add_theme_color_override("font_color", Color.WHITE)
	value_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	value_label.add_theme_constant_override("shadow_offset_x", 1)
	value_label.add_theme_constant_override("shadow_offset_y", 1)
	
	value_label.anchors_preset = Control.PRESET_FULL_RECT
	value_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	add_child(value_label)

func set_max_value(new_max: int):
	max_value = new_max
	update_bar()

func set_current_value(new_value: int):
	current_value = clamp(new_value, 0, max_value)
	update_bar()

func update_bar():
	if not value_bar or not value_label:
		return
	
	# Calculate percentage
	var percentage = float(current_value) / float(max_value) if max_value > 0 else 0.0
	
	# Update bar width
	var full_width = size.x - 40  # Account for margins
	var bar_width = full_width * percentage
	value_bar.custom_minimum_size.x = bar_width
	
	# Update label text
	value_label.text = str(current_value) + "/" + str(max_value)
	
	# Color the bar based on percentage
	if percentage > 0.6:
		value_bar.modulate = Color.WHITE
	elif percentage > 0.3:
		value_bar.modulate = Color.YELLOW
	else:
		value_bar.modulate = Color.RED

func animate_value_change(new_value: int):
	var old_value = current_value
	var tween = create_tween()
	
	# Animate the value change
	tween.tween_method(set_current_value, old_value, new_value, 0.5)
	tween.tween_callback(func(): current_value = new_value)

# Static helper methods for quick creation
static func create_health_bar(max_hp: int = 100, current_hp: int = 100) -> FantasyHealthBar:
	var bar = FantasyHealthBar.new()
	bar.bar_type = "health"
	bar.max_value = max_hp
	bar.current_value = current_hp
	return bar

static func create_mana_bar(max_mp: int = 50, current_mp: int = 50) -> FantasyHealthBar:
	var bar = FantasyHealthBar.new()
	bar.bar_type = "mana"
	bar.max_value = max_mp
	bar.current_value = current_mp
	return bar

static func create_energy_bar(max_ep: int = 75, current_ep: int = 75) -> FantasyHealthBar:
	var bar = FantasyHealthBar.new()
	bar.bar_type = "energy"
	bar.max_value = max_ep
	bar.current_value = current_ep
	return bar