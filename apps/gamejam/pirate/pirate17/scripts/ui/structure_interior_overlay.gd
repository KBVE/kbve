class_name StructureInteriorOverlay
extends Control

# Simple overlay system for structure interiors - no scene changes, just UI popup

signal exit_requested

@export var overlay_texture_path: String = "res://assets/ui/fantasy/RectangleBox_96x96.png"

var background_panel: Control  # Can be either NinePatchRect or ColorRect
var title_label: Label
var description_label: Label
var energy_recharge_label: Label
var exit_button: Button
var current_structure = null

func _ready():
	print("StructureInteriorOverlay: _ready() called")
	# Set up as fullscreen overlay
	anchors_preset = Control.PRESET_FULL_RECT
	size = get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
	position = Vector2.ZERO
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	setup_background()
	setup_ui_elements()
	
	# Handle ESC key for exit
	set_process_input(true)
	
	print("StructureInteriorOverlay: Setup complete, visible = ", visible, " size = ", size)

func setup_background():
	print("StructureInteriorOverlay: Setting up background...")
	# Semi-transparent dark background
	var dark_bg = ColorRect.new()
	dark_bg.color = Color(0, 0, 0, 0.7)
	dark_bg.anchors_preset = Control.PRESET_FULL_RECT
	dark_bg.size = get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
	dark_bg.position = Vector2.ZERO
	dark_bg.name = "DarkBackground"
	add_child(dark_bg)
	print("StructureInteriorOverlay: Dark background added, color: ", dark_bg.color, " size: ", dark_bg.size)
	
	# Main panel in center - use bright ColorRect for testing visibility
	var panel_bg = ColorRect.new()
	panel_bg.color = Color(1.0, 0.0, 0.0, 1.0)  # Bright red for testing
	panel_bg.size = Vector2(600, 400)
	background_panel = panel_bg
	
	# Try to load texture if available
	var texture = load(overlay_texture_path) if overlay_texture_path != "" else null
	if texture:
		# If texture loads, create NinePatchRect instead
		var nine_patch = NinePatchRect.new()
		nine_patch.texture = texture
		nine_patch.size = Vector2(600, 400)
		background_panel = nine_patch
		print("StructureInteriorOverlay: Using NinePatchRect with texture")
	else:
		print("StructureInteriorOverlay: Using ColorRect fallback")
	
	background_panel.size = Vector2(600, 400)
	background_panel.name = "BackgroundPanel"
	
	# Position the panel manually in the center
	background_panel.position = Vector2(340, 160)  # Center of 1280x720 screen
	print("StructureInteriorOverlay: Panel positioned at: ", background_panel.position, " size: ", background_panel.size)
	
	# Set nine-patch margins only if it's a NinePatchRect
	if background_panel is NinePatchRect:
		var nine_patch = background_panel as NinePatchRect
		nine_patch.patch_margin_left = 24
		nine_patch.patch_margin_right = 24
		nine_patch.patch_margin_top = 24
		nine_patch.patch_margin_bottom = 24
	
	add_child(background_panel)
	print("StructureInteriorOverlay: Background panel added to scene")

func setup_ui_elements():
	print("StructureInteriorOverlay: Setting up UI elements...")
	# Title
	title_label = Label.new()
	title_label.text = "Structure Interior"
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.add_theme_font_size_override("font_size", 24)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	title_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	title_label.add_theme_constant_override("shadow_offset_x", 2)
	title_label.add_theme_constant_override("shadow_offset_y", 2)
	title_label.position = Vector2(50, 40)
	title_label.size = Vector2(500, 40)
	background_panel.add_child(title_label)
	
	# Description
	description_label = Label.new()
	description_label.text = "You are inside the structure."
	description_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	description_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	description_label.add_theme_font_size_override("font_size", 16)
	description_label.add_theme_color_override("font_color", Color.WHITE)
	description_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	description_label.add_theme_constant_override("shadow_offset_x", 1)
	description_label.add_theme_constant_override("shadow_offset_y", 1)
	description_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	description_label.position = Vector2(50, 100)
	description_label.size = Vector2(500, 150)
	background_panel.add_child(description_label)
	
	# Energy recharge notification
	energy_recharge_label = Label.new()
	energy_recharge_label.text = "Your energy has been restored!"
	energy_recharge_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	energy_recharge_label.add_theme_font_size_override("font_size", 14)
	energy_recharge_label.add_theme_color_override("font_color", Color.LIGHT_GREEN)
	energy_recharge_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	energy_recharge_label.add_theme_constant_override("shadow_offset_x", 1)
	energy_recharge_label.add_theme_constant_override("shadow_offset_y", 1)
	energy_recharge_label.position = Vector2(50, 270)
	energy_recharge_label.size = Vector2(500, 30)
	background_panel.add_child(energy_recharge_label)
	
	# Exit button
	exit_button = Button.new()
	exit_button.text = "Exit"
	exit_button.add_theme_font_size_override("font_size", 16)
	exit_button.add_theme_color_override("font_color", Color.WHITE)
	exit_button.add_theme_color_override("font_pressed_color", Color.YELLOW)
	exit_button.add_theme_color_override("font_hover_color", Color.LIGHT_GRAY)
	exit_button.position = Vector2(250, 320)
	exit_button.size = Vector2(100, 40)
	exit_button.pressed.connect(_on_exit_pressed)
	# Ensure button blocks mouse events
	exit_button.mouse_filter = Control.MOUSE_FILTER_STOP
	background_panel.add_child(exit_button)
	
	print("StructureInteriorOverlay: All UI elements added to background panel")

func show_for_structure(structure):
	# Comprehensive null checking
	if not structure:
		print("WARNING: Attempted to show overlay for null structure")
		return
	
	# Validate we have required UI elements
	if not title_label or not description_label or not energy_recharge_label:
		print("WARNING: UI elements not properly initialized")
		return
	
	current_structure = structure
	
	# Set title based on structure with error handling
	title_label.text = get_structure_title(structure)
	
	# Set description with error handling
	description_label.text = get_structure_description(structure)
	
	# Recharge player energy and ammo with error handling
	recharge_player_resources(structure)
	
	# Ensure proper sizing and positioning before showing
	var viewport_size = get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
	size = viewport_size
	position = Vector2.ZERO
	
	# Show the overlay
	visible = true
	# Ensure it captures mouse events
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Move to front of render order
	move_to_front()
	
	# Double-check dark background is visible
	var dark_bg = get_node_or_null("DarkBackground")
	if dark_bg:
		dark_bg.visible = true
		print("StructureInteriorOverlay: Dark background visibility = ", dark_bg.visible)
	
	print("StructureInteriorOverlay: Overlay shown for: ", get_structure_title(structure))
	print("StructureInteriorOverlay: visible = ", visible, ", is_inside_tree = ", is_inside_tree())
	print("StructureInteriorOverlay: position = ", position, ", size = ", size)
	print("StructureInteriorOverlay: viewport_size = ", viewport_size)
	print("StructureInteriorOverlay: z_index = ", z_index, ", modulate = ", modulate)
	print("StructureInteriorOverlay: children count = ", get_child_count())

func get_structure_title(structure) -> String:
	# Safe property access with multiple fallbacks
	if not structure:
		return "Unknown Structure"
	
	# Try to get name property safely - Structure class always has these properties
	if structure.name and structure.name != "":
		return str(structure.name)
	
	# Fallback to type-based name - type is always defined in Structure class
	return get_type_based_name(structure.type)

func get_type_based_name(structure_type) -> String:
	# Safe type-based naming
	match structure_type:
		StructurePool.StructureType.CITY:
			return "City"
		StructurePool.StructureType.VILLAGE:
			return "Village"
		StructurePool.StructureType.CASTLE:
			return "Castle"
		StructurePool.StructureType.TEMPLE:
			return "Temple"
		StructurePool.StructureType.PORT:
			return "Port"
		StructurePool.StructureType.TOWER:
			return "Tower"
		StructurePool.StructureType.RUINS:
			return "Ruins"
		StructurePool.StructureType.FORTRESS:
			return "Fortress"
		_:
			return "Structure"

func get_structure_description(structure) -> String:
	if not structure:
		return "You are inside a mysterious structure."
	
	var base_desc = ""
	
	# Structure class always has type property
	var structure_type = structure.type
	
	if structure_type != null:
		match structure_type:
			StructurePool.StructureType.CITY:
				base_desc = "You are in a bustling city. Merchants and citizens go about their business. The energy of commerce fills the air."
			StructurePool.StructureType.VILLAGE:
				base_desc = "You are in a peaceful village. The locals welcome you warmly. Simple life continues around you."
			StructurePool.StructureType.CASTLE:
				base_desc = "You are inside a magnificent castle. Noble banners hang from the walls and guards patrol the halls."
			StructurePool.StructureType.TEMPLE:
				base_desc = "You are in a sacred temple. Divine energy flows through this holy place, bringing peace to your soul."
			StructurePool.StructureType.PORT:
				base_desc = "You are at a busy port. The smell of salt air and sounds of ships loading cargo surround you."
			StructurePool.StructureType.TOWER:
				base_desc = "You are inside a mysterious tower. Ancient magic seems to permeate the very stones."
			StructurePool.StructureType.RUINS:
				base_desc = "You are exploring ancient ruins. Whispers of forgotten civilizations echo in the shadows."
			StructurePool.StructureType.FORTRESS:
				base_desc = "You are in a military fortress. Soldiers train and maintain the realm's defenses."
			_:
				base_desc = "You are inside an interesting structure."
	else:
		base_desc = "You are inside a mysterious structure."
	
	# Population is always defined in Structure class (defaults to 0)
	if structure.population > 0:
		base_desc += "\n\nPopulation: " + str(structure.population)
	
	# Services is always defined in Structure class (defaults to empty array)
	if structure.services.size() > 0:
		base_desc += "\nServices: " + ", ".join(structure.services)
	
	return base_desc

func recharge_player_resources(structure):
	# Comprehensive null checks for player and stats
	if not Global:
		print("WARNING: Global singleton not found")
		energy_recharge_label.text = "Unable to restore energy."
		return
		
	if not Global.get("player"):
		print("WARNING: Global.player not found")
		energy_recharge_label.text = "Unable to restore energy."
		return
		
	if not Global.player or not Global.player.get("stats"):
		print("WARNING: Global.player.stats not found")
		energy_recharge_label.text = "Unable to restore energy."
		return
	
	var player_stats = Global.player.stats
	var energy_restored = 0
	var spears_restored = 0
	
	# Get main scene to access ammo UI
	var main_scene = get_tree().get_nodes_in_group("main_scene")[0] if get_tree().get_nodes_in_group("main_scene").size() > 0 else null
	var ammo_ui = null
	if main_scene and main_scene.get("airship_ammo_ui"):
		ammo_ui = main_scene.airship_ammo_ui
	
	# Structure class always has type property
	var structure_type = structure.type if structure else null
	
	# Different structures provide different amounts of energy restoration
	if structure_type != null:
		match structure_type:
			StructurePool.StructureType.TEMPLE:
				# Temples fully restore energy and some health
				energy_restored = player_stats.max_energy - player_stats.energy
				player_stats.energy = player_stats.max_energy
				var health_restored = min(20, player_stats.max_health - player_stats.health)
				player_stats.health += health_restored
				
				# Temples also restore significant spears
				if ammo_ui:
					spears_restored = min(100, ammo_ui.max_ammo - ammo_ui.current_ammo)
					ammo_ui.reload_ammo(spears_restored)
				
				var restore_text = "Divine energy fully restores you! +" + str(energy_restored) + " energy, +" + str(health_restored) + " health"
				if spears_restored > 0:
					restore_text += ", +" + str(spears_restored) + " spears"
				energy_recharge_label.text = restore_text
			
			StructurePool.StructureType.CITY, StructurePool.StructureType.VILLAGE:
				# Cities and villages restore good amount of energy
				energy_restored = min(30, player_stats.max_energy - player_stats.energy)
				player_stats.energy += energy_restored
				
				# Cities and villages also restore moderate spears
				if ammo_ui:
					spears_restored = min(50, ammo_ui.max_ammo - ammo_ui.current_ammo)
					ammo_ui.reload_ammo(spears_restored)
				
				var restore_text = "Rest in the settlement restores your energy! +" + str(energy_restored) + " energy"
				if spears_restored > 0:
					restore_text += ", +" + str(spears_restored) + " spears"
				energy_recharge_label.text = restore_text
			
			StructurePool.StructureType.PORT:
				# Ports restore moderate energy
				energy_restored = min(20, player_stats.max_energy - player_stats.energy)
				player_stats.energy += energy_restored
				
				# Ports provide good spear supplies from weapon merchants
				if ammo_ui:
					spears_restored = min(75, ammo_ui.max_ammo - ammo_ui.current_ammo)
					ammo_ui.reload_ammo(spears_restored)
				
				var restore_text = "The sea breeze refreshes you! +" + str(energy_restored) + " energy"
				if spears_restored > 0:
					restore_text += ", +" + str(spears_restored) + " spears"
				energy_recharge_label.text = restore_text
			
			_:
				# Other structures restore some energy
				energy_restored = min(15, player_stats.max_energy - player_stats.energy)
				player_stats.energy += energy_restored
				
				# Other structures provide small spear supplies
				if ammo_ui:
					spears_restored = min(25, ammo_ui.max_ammo - ammo_ui.current_ammo)
					ammo_ui.reload_ammo(spears_restored)
				
				var restore_text = "Taking shelter restores some energy! +" + str(energy_restored) + " energy"
				if spears_restored > 0:
					restore_text += ", +" + str(spears_restored) + " spears"
				energy_recharge_label.text = restore_text
	else:
		# No structure type - still restore some energy
		energy_restored = min(10, player_stats.max_energy - player_stats.energy)
		player_stats.energy += energy_restored
		
		# Even unknown structures provide minimal spears
		if ammo_ui:
			spears_restored = min(10, ammo_ui.max_ammo - ammo_ui.current_ammo)
			ammo_ui.reload_ammo(spears_restored)
		
		var restore_text = "Resting restores some energy! +" + str(energy_restored) + " energy"
		if spears_restored > 0:
			restore_text += ", +" + str(spears_restored) + " spears"
		energy_recharge_label.text = restore_text
	
	if energy_restored == 0 and spears_restored == 0:
		energy_recharge_label.text = "You are already fully energized and armed!"

func hide_overlay():
	visible = false
	current_structure = null

func _input(event):
	if visible and event is InputEventKey and event.pressed:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_ENTER:
			_on_exit_pressed()

func _on_exit_pressed():
	exit_requested.emit()
	hide_overlay()
