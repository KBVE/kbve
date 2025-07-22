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
	# Set up as fullscreen overlay
	anchors_preset = Control.PRESET_FULL_RECT
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	setup_background()
	setup_ui_elements()
	
	# Handle ESC key for exit
	set_process_input(true)

func setup_background():
	# Semi-transparent dark background
	var dark_bg = ColorRect.new()
	dark_bg.color = Color(0, 0, 0, 0.7)
	dark_bg.anchors_preset = Control.PRESET_FULL_RECT
	add_child(dark_bg)
	
	# Main panel in center
	background_panel = NinePatchRect.new()
	background_panel.texture = load(overlay_texture_path)
	background_panel.size = Vector2(600, 400)
	background_panel.position = Vector2(
		(get_viewport().size.x - 600) / 2,
		(get_viewport().size.y - 400) / 2
	)
	
	# Set nine-patch margins
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
	current_structure = structure
	
	# Set title based on structure
	title_label.text = get_structure_title(structure)
	
	# Set description
	description_label.text = get_structure_description(structure)
	
	# Recharge player energy
	recharge_player_energy(structure)
	
	# Show the overlay
	visible = true

func get_structure_title(structure) -> String:
	if structure and structure.name:
		return structure.name
	return "Unknown Structure"

func get_structure_description(structure) -> String:
	if not structure:
		return "You are inside a mysterious structure."
	
	var base_desc = ""
	match structure.type:
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
	
	# Add population info if available
	if structure.population > 0:
		base_desc += "\n\nPopulation: " + str(structure.population)
	
	# Add services info if available
	if structure.services and structure.services.size() > 0:
		base_desc += "\nServices: " + ", ".join(structure.services)
	
	return base_desc

func recharge_player_energy(structure):
	if not Global.player or not Global.player.stats:
		return
	
	var player_stats = Global.player.stats
	var energy_restored = 0
	
	# Different structures provide different amounts of energy restoration
	match structure.type:
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