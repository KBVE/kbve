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
	
	# Initial size - will be adjusted when text is set
	custom_minimum_size = Vector2(70, 16)
	size = Vector2(70, 16)
	
	# Resize to fit text after setup
	if state_text != "":
		resize_to_fit_text()

func setup_background():
	background_panel = NinePatchRect.new()
	background_panel.texture = load(badge_texture_path)
	
	# Don't use anchors preset - set size manually
	background_panel.position = Vector2.ZERO
	background_panel.size = size  # Use our control's size
	
	# Set nine-patch margins for proper stretching - adjusted for button texture
	background_panel.patch_margin_left = 4
	background_panel.patch_margin_right = 4
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
	
	# Set position and size manually instead of using anchors
	state_label.position = Vector2(4, 2)
	state_label.size = Vector2(size.x - 8, size.y - 4)  # Account for padding
	
	background_panel.add_child(state_label)

func set_state_text(new_state: String):
	state_text = new_state
	if state_label:
		state_label.text = state_text
		# Update text color based on state
		if state_colors.has(new_state):
			state_label.add_theme_color_override("font_color", state_colors[new_state])
		# Resize to fit the new text
		resize_to_fit_text()

func resize_to_fit_text():
	if not state_label:
		return
	
	# Force the label to calculate its content size
	state_label.reset_size()
	
	# Get the text dimensions
	var font = state_label.get_theme_font("font")
	var font_size = state_label.get_theme_font_size("font_size")
	
	# Use default font if theme font is not available
	if not font:
		font = ThemeDB.fallback_font
	if font_size <= 0:
		font_size = 8  # Our custom font size
	
	# Calculate text size with some padding
	var text_size = font.get_string_size(state_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var padding_horizontal = 16  # 8px on each side for nine-patch margins
	var padding_vertical = 8    # 4px on top/bottom
	
	# Set new size with padding
	var new_size = Vector2(
		max(text_size.x + padding_horizontal, 50),  # Minimum width of 50
		max(text_size.y + padding_vertical, 16)     # Minimum height of 16
	)
	
	custom_minimum_size = new_size
	size = new_size
	
	# Force the background panel to match our size
	if background_panel:
		background_panel.size = new_size
		background_panel.custom_minimum_size = new_size
	
	# Update label size too
	if state_label:
		state_label.size = Vector2(new_size.x - 8, new_size.y - 4)

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