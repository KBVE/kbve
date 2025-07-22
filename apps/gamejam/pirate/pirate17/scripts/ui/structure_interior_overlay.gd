class_name StructureInteriorOverlay
extends Control

# Simple overlay system for structure interiors - no scene changes, just UI popup

signal exit_requested

@export var overlay_texture_path: String = "res://assets/ui/fantasy/RectangleBox_96x96.png"

var background_panel: NinePatchRect
var title_label: Label
var description_label: Label
var energy_recharge_label: Label
var exit_button: Button
var current_structure = null

func _ready():
	print("StructureInteriorOverlay: _ready() called")
	# Set up as fullscreen overlay
	anchors_preset = Control.PRESET_FULL_RECT
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	setup_background()
	setup_ui_elements()
	
	# Handle ESC key for exit
	set_process_input(true)
	
	print("StructureInteriorOverlay: Setup complete, visible = ", visible)

func setup_background():
	# Semi-transparent dark background
	var dark_bg = ColorRect.new()
	dark_bg.color = Color(0, 0, 0, 0.7)
	dark_bg.anchors_preset = Control.PRESET_FULL_RECT
	add_child(dark_bg)
	
	# Main panel in center
	background_panel = NinePatchRect.new()
	
	# Safe texture loading
	var texture = load(overlay_texture_path)
	if texture:
		background_panel.texture = texture
	else:
		print("WARNING: Could not load overlay texture at ", overlay_texture_path)
		# Create a fallback colored panel
		var fallback_bg = ColorRect.new()
		fallback_bg.color = Color(0.2, 0.2, 0.2, 0.9)
		fallback_bg.size = Vector2(600, 400)
		background_panel = fallback_bg
	
	background_panel.size = Vector2(600, 400)
	
	# Safe viewport size access
	var viewport_size = get_viewport().size if get_viewport() else Vector2(1280, 720)
	background_panel.position = Vector2(
		(viewport_size.x - 600) / 2,
		(viewport_size.y - 400) / 2
	)
	
	# Set nine-patch margins only if it's a NinePatchRect
	if background_panel is NinePatchRect:
		background_panel.patch_margin_left = 24
		background_panel.patch_margin_right = 24
		background_panel.patch_margin_top = 24
		background_panel.patch_margin_bottom = 24
	
	add_child(background_panel)

func setup_ui_elements():
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
	background_panel.add_child(exit_button)

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
	
	# Recharge player energy with error handling
	recharge_player_energy(structure)
	
	# Show the overlay
	visible = true
	
	print("StructureInteriorOverlay: Overlay shown for: ", get_structure_title(structure))
	print("StructureInteriorOverlay: visible = ", visible, ", is_inside_tree = ", is_inside_tree())
	print("StructureInteriorOverlay: position = ", position, ", size = ", size)

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

func recharge_player_energy(structure):
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
				energy_recharge_label.text = "Divine energy fully restores you! +" + str(energy_restored) + " energy, +" + str(health_restored) + " health"
			
			StructurePool.StructureType.CITY, StructurePool.StructureType.VILLAGE:
				# Cities and villages restore good amount of energy
				energy_restored = min(30, player_stats.max_energy - player_stats.energy)
				player_stats.energy += energy_restored
				energy_recharge_label.text = "Rest in the settlement restores your energy! +" + str(energy_restored) + " energy"
			
			StructurePool.StructureType.PORT:
				# Ports restore moderate energy
				energy_restored = min(20, player_stats.max_energy - player_stats.energy)
				player_stats.energy += energy_restored
				energy_recharge_label.text = "The sea breeze refreshes you! +" + str(energy_restored) + " energy"
			
			_:
				# Other structures restore some energy
				energy_restored = min(15, player_stats.max_energy - player_stats.energy)
				player_stats.energy += energy_restored
				energy_recharge_label.text = "Taking shelter restores some energy! +" + str(energy_restored) + " energy"
	else:
		# No structure type - still restore some energy
		energy_restored = min(10, player_stats.max_energy - player_stats.energy)
		player_stats.energy += energy_restored
		energy_recharge_label.text = "Resting restores some energy! +" + str(energy_restored) + " energy"
	
	if energy_restored == 0:
		energy_recharge_label.text = "You are already fully energized!"

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