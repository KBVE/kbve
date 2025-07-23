class_name StructureInteractionTooltip
extends Control

signal interaction_requested(structure)

@export var tooltip_texture_path: String = "res://assets/ui/fantasy/RectangleBox_96x96.png"

var background_panel: NinePatchRect
var structure_name_label: Label
var interaction_label: Label
var click_button: Button
var current_structure = null

func _ready():
	# Set size for interaction tooltip - make it bigger
	custom_minimum_size = Vector2(220, 100)
	size = Vector2(220, 100)
	
	setup_background()
	setup_labels()
	setup_button()  # Must be called after setup_background() so background_panel exists
	
	# Start hidden
	visible = false
	
	# Ensure this tooltip intercepts mouse events to prevent click-through
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Connect resize signal
	resized.connect(_on_resized)

func setup_background():
	background_panel = NinePatchRect.new()
	background_panel.texture = load(tooltip_texture_path)
	background_panel.anchors_preset = Control.PRESET_FULL_RECT
	background_panel.position = Vector2.ZERO
	background_panel.size = size
	
	# Set nine-patch margins
	background_panel.patch_margin_left = 16
	background_panel.patch_margin_right = 16
	background_panel.patch_margin_top = 8
	background_panel.patch_margin_bottom = 8
	
	# Ensure background also stops mouse events
	background_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	
	add_child(background_panel)
	
	# Move panel to back so labels and button appear on top
	move_child(background_panel, 0)

func setup_labels():
	# Structure name label at the top
	structure_name_label = Label.new()
	structure_name_label.text = "Structure Name"
	structure_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	structure_name_label.add_theme_font_size_override("font_size", 14)
	structure_name_label.add_theme_color_override("font_color", Color.YELLOW)
	structure_name_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	structure_name_label.add_theme_constant_override("shadow_offset_x", 1)
	structure_name_label.add_theme_constant_override("shadow_offset_y", 1)
	structure_name_label.position = Vector2(10, 5)
	structure_name_label.size = Vector2(200, 20)
	add_child(structure_name_label)
	
	# Main interaction text below the name
	interaction_label = Label.new()
	interaction_label.text = "Press F to Enter"
	interaction_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	interaction_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	interaction_label.add_theme_font_size_override("font_size", 11)
	interaction_label.add_theme_color_override("font_color", Color.WHITE)
	interaction_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	interaction_label.add_theme_constant_override("shadow_offset_x", 1)
	interaction_label.add_theme_constant_override("shadow_offset_y", 1)
	interaction_label.position = Vector2(10, 25)
	interaction_label.size = Vector2(200, 20)
	add_child(interaction_label)

func setup_button():
	# Click to enter button - positioned inside the panel
	click_button = Button.new()
	click_button.text = "Click to Enter"
	click_button.add_theme_font_size_override("font_size", 10)
	
	# Style the button to match fantasy theme
	click_button.add_theme_color_override("font_color", Color.WHITE)
	click_button.add_theme_color_override("font_pressed_color", Color.YELLOW)
	click_button.add_theme_color_override("font_hover_color", Color.LIGHT_GRAY)
	
	# Position below the "Press F" text, inside the panel
	click_button.position = Vector2(35, 55)
	click_button.size = Vector2(150, 25)
	
	# Connect button signal
	click_button.pressed.connect(_on_click_button_pressed)
	
	# Ensure button blocks mouse events
	click_button.mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Add to background panel, not the main control
	background_panel.add_child(click_button)

func show_for_structure(structure):
	current_structure = structure
	
	# Update structure name
	if structure and structure.name:
		structure_name_label.text = structure.name
	else:
		structure_name_label.text = "Unknown Structure"
	
	# Update text based on structure type
	var interaction_text = "Press F to Enter"
	if structure and not structure.is_enterable:
		interaction_text = "Press F to Interact"
		click_button.text = "Click to Interact"
	else:
		click_button.text = "Click to Enter"
	
	interaction_label.text = interaction_text
	visible = true

func hide_tooltip():
	current_structure = null
	visible = false

func _on_click_button_pressed():
	if current_structure:
		# Stop the input from propagating
		get_viewport().set_input_as_handled()
		interaction_requested.emit(current_structure)

func _gui_input(event):
	# Handle input on the tooltip itself to prevent click-through
	if event is InputEventMouseButton:
		# Always consume mouse events over the tooltip
		accept_event()
		get_viewport().set_input_as_handled()

func handle_interaction_key():
	"""Call this when F key is pressed"""
	if current_structure and visible:
		interaction_requested.emit(current_structure)

# Position tooltip above player or structure
func position_above_target(target_position: Vector2, offset: Vector2 = Vector2(-80, -90)):
	position = target_position + offset

func _on_resized():
	if background_panel:
		background_panel.size = size