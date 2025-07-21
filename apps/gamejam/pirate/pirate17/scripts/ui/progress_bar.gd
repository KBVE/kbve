class_name FantasyProgressBar
extends Control

@export var background_texture: Texture2D
@export var fill_texture: Texture2D
@export var bar_color: Color = Color.WHITE
@export var background_color: Color = Color(0.2, 0.2, 0.2, 0.8)

var background_panel: NinePatchRect
var fill_container: Control
var fill_rect: ColorRect
var label: Label

var current_value: float = 100.0
var max_value: float = 100.0
var label_text: String = ""

signal value_changed(new_value: float, max_val: float)

func _ready():
	# Force expand to fill available space
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	
	# Set default minimum size (can be overridden by scene)
	if custom_minimum_size == Vector2.ZERO:
		custom_minimum_size = Vector2(280, 50)
	
	# Defer setup to ensure proper sizing first
	call_deferred("setup_components")

func setup_components():
	setup_background()
	setup_fill_bar()
	setup_label()
	
	# Force an initial update after everything is set up
	call_deferred("update_display")
	call_deferred("debug_sizing")

func setup_background():
	# Create background panel that wraps around the entire progress bar
	background_panel = NinePatchRect.new()
	if background_texture:
		background_panel.texture = background_texture
		# Set appropriate patch margins for the fantasy textures
		background_panel.patch_margin_left = 15
		background_panel.patch_margin_top = 8
		background_panel.patch_margin_right = 15
		background_panel.patch_margin_bottom = 8
	else:
		# Fallback ColorRect if no texture
		var bg_rect = ColorRect.new()
		bg_rect.color = background_color
		bg_rect.anchors_preset = Control.PRESET_FULL_RECT
		bg_rect.z_index = 0
		add_child(bg_rect)
		return
	
	# Ensure the background fills the entire control
	add_child(background_panel)
	background_panel.anchors_preset = Control.PRESET_FULL_RECT
	background_panel.z_index = 0  # Behind everything as the border frame
	
	# Force the background to match our control size
	background_panel.size = size
	background_panel.position = Vector2.ZERO

func setup_fill_bar():
	# Create the actual fill rectangle directly - no container
	fill_rect = ColorRect.new()
	fill_rect.color = bar_color
	fill_rect.z_index = 1  # Above background border
	
	# Position it with margins inside the fantasy border - using the border's patch margins
	fill_rect.anchor_left = 0.0
	fill_rect.anchor_top = 0.0
	fill_rect.anchor_right = 0.0  # Don't use right anchor initially
	fill_rect.anchor_bottom = 1.0
	fill_rect.offset_left = 15   # Match patch_margin_left
	fill_rect.offset_top = 8     # Match patch_margin_top  
	fill_rect.offset_right = 100 # Initial width (will be updated)
	fill_rect.offset_bottom = -8  # Match patch_margin_bottom
	
	add_child(fill_rect)

func setup_label():
	# Create text label for current/max values
	label = Label.new()
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	
	# Position label to match the progress bar area (with same margins as fill_rect)
	label.anchor_left = 0.0
	label.anchor_top = 0.0
	label.anchor_right = 1.0
	label.anchor_bottom = 1.0
	label.offset_left = 15   # Same as fill_rect left margin
	label.offset_top = 8     # Same as fill_rect top margin
	label.offset_right = -15 # Same right margin
	label.offset_bottom = -8  # Same as fill_rect bottom margin
	
	label.add_theme_font_size_override("font_size", 14)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_color_override("font_shadow_color", Color.BLACK)
	label.add_theme_constant_override("shadow_offset_x", 2)
	label.add_theme_constant_override("shadow_offset_y", 2)
	label.z_index = 10  # Above everything
	add_child(label)

func set_value(new_value: float, new_max: float = -1):
	current_value = new_value
	if new_max > 0:
		max_value = new_max
	
	# Clamp value to valid range
	current_value = clamp(current_value, 0, max_value)
	
	update_display()
	value_changed.emit(current_value, max_value)

func set_max_value(new_max: float):
	max_value = new_max
	current_value = clamp(current_value, 0, max_value)
	update_display()

func set_label_text(text: String):
	label_text = text
	update_display()

func set_color(color: Color):
	bar_color = color
	if fill_rect:
		fill_rect.color = bar_color

func update_display():
	if not fill_rect or not label:
		print("ProgressBar: Missing components - fill_rect:", fill_rect, " label:", label)
		return
	
	# Calculate fill percentage
	var percentage = current_value / max_value if max_value > 0 else 0.0
	percentage = clamp(percentage, 0.0, 1.0)
	
	# Update fill bar width - adjusted for border margins
	var total_width = size.x
	var usable_width = total_width - 30  # 15px margin on each side (patch margins)
	var fill_width = usable_width * percentage
	
	fill_rect.anchor_left = 0.0
	fill_rect.anchor_top = 0.0
	fill_rect.anchor_right = 0.0  # Don't use anchor for width
	fill_rect.anchor_bottom = 1.0
	fill_rect.offset_left = 15   # Left margin (patch margin)
	fill_rect.offset_top = 8     # Top margin (patch margin)
	fill_rect.offset_right = 15 + fill_width  # Left margin + fill width
	fill_rect.offset_bottom = -8 # Bottom margin (patch margin)
	
	# Update label text
	var display_text = label_text
	if display_text.is_empty():
		display_text = str(int(current_value)) + "/" + str(int(max_value))
	else:
		display_text += ": " + str(int(current_value)) + "/" + str(int(max_value))
	
	label.text = display_text
	
	print("ProgressBar: Updated ", label_text, " - ", percentage * 100, "% (", current_value, "/", max_value, ") - Size:", size, " Fill width:", fill_width, " Total width:", total_width)

func debug_sizing():
	print("ProgressBar Debug - Control size:", size, " Custom min size:", custom_minimum_size)
	print("Position:", position)
	if fill_rect:
		print("Fill rect size:", fill_rect.size, " Position:", fill_rect.position)
	if background_panel:
		print("Background panel size:", background_panel.size, " Position:", background_panel.position)
		print("Background texture:", background_panel.texture)
		print("Background anchors - left:", background_panel.anchor_left, " top:", background_panel.anchor_top, " right:", background_panel.anchor_right, " bottom:", background_panel.anchor_bottom)

func get_percentage() -> float:
	return current_value / max_value if max_value > 0 else 0.0

# Animate the bar filling/emptying
func animate_to_value(target_value: float, duration: float = 0.3):
	if not is_inside_tree():
		set_value(target_value)
		return
	
	var tween = create_tween()
	tween.tween_method(set_value, current_value, target_value, duration)
	tween.tween_callback(func(): update_display())

# Static helper function to create common bar types
static func create_health_bar() -> FantasyProgressBar:
	var bar = FantasyProgressBar.new()
	bar.bar_color = Color(1.0, 0.3, 0.3, 1.0)  # Red
	bar.label_text = "Health"
	return bar

static func create_mana_bar() -> FantasyProgressBar:
	var bar = FantasyProgressBar.new()
	bar.bar_color = Color(0.3, 0.5, 1.0, 1.0)  # Blue
	bar.label_text = "Mana"
	return bar

static func create_energy_bar() -> FantasyProgressBar:
	var bar = FantasyProgressBar.new()
	bar.bar_color = Color(0.9, 0.7, 0.2, 1.0)  # Yellow/Gold
	bar.label_text = "Energy"
	return bar