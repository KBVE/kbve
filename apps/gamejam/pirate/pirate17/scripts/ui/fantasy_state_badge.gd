class_name FantasyStateBadge
extends Control

@export var badge_texture_path: String = "res://assets/ui/fantasy/Button_52x14.png"
@export var state_text: String = "" : set = set_state_text

var background_panel: NinePatchRect
var state_label: Label

# State colors
var state_colors = {
	"Wandering...": Color(0.8, 0.8, 0.8, 1.0),      # Light gray
	"Aggressive!": Color(1.0, 0.4, 0.4, 1.0),       # Red
	"Retreating...": Color(1.0, 0.8, 0.2, 1.0)      # Yellow/Orange
}

func _ready():
	setup_background()
	setup_label()
	
	# Set compact size for NPC badges to match button asset
	custom_minimum_size = Vector2(70, 16)
	size = Vector2(70, 16)

func setup_background():
	background_panel = NinePatchRect.new()
	background_panel.texture = load(badge_texture_path)
	background_panel.anchors_preset = Control.PRESET_FULL_RECT
	
	# Set nine-patch margins for proper stretching
	background_panel.patch_margin_left = 8
	background_panel.patch_margin_right = 8
	background_panel.patch_margin_top = 4
	background_panel.patch_margin_bottom = 4
	
	add_child(background_panel)

func setup_label():
	state_label = Label.new()
	state_label.text = state_text
	state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	state_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	state_label.add_theme_font_size_override("font_size", 8)
	state_label.add_theme_color_override("font_color", Color.WHITE)
	state_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	state_label.add_theme_constant_override("shadow_offset_x", 1)
	state_label.add_theme_constant_override("shadow_offset_y", 1)
	
	state_label.anchors_preset = Control.PRESET_FULL_RECT
	state_label.offset_left = 4
	state_label.offset_right = -4
	state_label.offset_top = 2
	state_label.offset_bottom = -2
	
	background_panel.add_child(state_label)

func set_state_text(new_state: String):
	state_text = new_state
	if state_label:
		state_label.text = state_text
		# Update text color based on state
		if state_colors.has(new_state):
			state_label.add_theme_color_override("font_color", state_colors[new_state])

func update_state(new_state: String):
	set_state_text(new_state)

# Convenience function to create and position above an entity
static func create_above_entity(entity: Node2D, initial_state: String = "Wandering...") -> FantasyStateBadge:
	var badge = FantasyStateBadge.new()
	badge.state_text = initial_state
	badge.position = Vector2(-40, -50)  # Position above entity
	badge.z_index = 20  # Render above everything
	entity.add_child(badge)
	return badge