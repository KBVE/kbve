class_name BaseInterior
extends Control

# Base class for all structure interior scenes

@export var structure_type: StructurePool.StructureType
@export var background_color: Color = Color(0.3, 0.25, 0.2, 1.0)  # Warm indoor color
@export var exit_button_text: String = "Exit"

var structure_data: Dictionary = {}
var fantasy_menu: FantasyMenu
var background: ColorRect
var title_display: FantasyTitle
var info_panel: FantasyPanel

signal exit_requested
signal action_selected(action: String, data: Dictionary)

func _ready():
	setup_background()
	setup_ui()
	setup_exit_handling()
	
	# Get structure data if passed during scene transition
	if has_meta("structure_data"):
		structure_data = get_meta("structure_data")
		update_content_for_structure()

func setup_background():
	# Create full-screen background
	background = ColorRect.new()
	background.color = background_color
	background.anchors_preset = Control.PRESET_FULL_RECT
	background.z_index = -1
	add_child(background)

func setup_ui():
	# Create title display
	setup_title()
	
	# Create main menu for interactions
	setup_main_menu()
	
	# Create info panel
	setup_info_panel()

func setup_title():
	title_display = FantasyTitle.new()
	title_display.title_text = get_structure_title()
	title_display.size = Vector2(400, 80)
	title_display.position = Vector2(440, 50)
	add_child(title_display)

func setup_main_menu():
	fantasy_menu = FantasyMenu.new()
	fantasy_menu.size = Vector2(350, 400)
	fantasy_menu.position = Vector2(465, 150)
	
	# Connect menu signals
	fantasy_menu.menu_action.connect(_on_menu_action)
	add_child(fantasy_menu)
	
	# Add default actions
	populate_menu_actions()

func setup_info_panel():
	info_panel = FantasyPanel.new()
	info_panel.title_text = "Information"
	info_panel.size = Vector2(300, 200)
	info_panel.position = Vector2(100, 150)
	add_child(info_panel)
	
	# Add structure info content
	populate_info_content()

func setup_exit_handling():
	# Handle ESC key for exiting
	set_process_input(true)

func _input(event):
	if event is InputEventKey and event.pressed:
		if event.keycode == KEY_ESCAPE:
			exit_interior()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return get_default_structure_name()

func get_default_structure_name() -> String:
	match structure_type:
		StructurePool.StructureType.CITY:
			return "City Hall"
		StructurePool.StructureType.CASTLE:
			return "Royal Castle"
		StructurePool.StructureType.VILLAGE:
			return "Village Center"
		StructurePool.StructureType.TOWER:
			return "Ancient Tower"
		StructurePool.StructureType.RUINS:
			return "Mysterious Ruins"
		StructurePool.StructureType.TEMPLE:
			return "Sacred Temple"
		StructurePool.StructureType.FORTRESS:
			return "Military Fortress"
		StructurePool.StructureType.PORT:
			return "Harbor District"
		_:
			return "Unknown Location"

func populate_menu_actions():
	# Add structure-specific actions
	match structure_type:
		StructurePool.StructureType.CITY:
			setup_city_actions()
		StructurePool.StructureType.VILLAGE:
			setup_village_actions()
		StructurePool.StructureType.TEMPLE:
			setup_temple_actions()
		StructurePool.StructureType.PORT:
			setup_port_actions()
		_:
			setup_default_actions()
	
	# Always add exit option
	fantasy_menu.add_menu_button(exit_button_text, "exit")

func setup_city_actions():
	fantasy_menu.add_large_button("Visit Market", "market")
	fantasy_menu.add_large_button("Go to Tavern", "tavern")
	fantasy_menu.add_large_button("Visit Blacksmith", "blacksmith")
	fantasy_menu.add_menu_button("City Services", "services")

func setup_village_actions():
	fantasy_menu.add_large_button("Visit Shop", "shop")
	fantasy_menu.add_large_button("Go to Inn", "inn")
	fantasy_menu.add_menu_button("Talk to Villagers", "talk")

func setup_temple_actions():
	fantasy_menu.add_large_button("Pray", "pray")
	fantasy_menu.add_large_button("Seek Healing", "healing")
	fantasy_menu.add_menu_button("Make Donation", "donate")

func setup_port_actions():
	fantasy_menu.add_large_button("Ship Services", "ships")
	fantasy_menu.add_large_button("Trade Goods", "trade")
	fantasy_menu.add_large_button("Harbor Master", "harbor")

func setup_default_actions():
	fantasy_menu.add_large_button("Look Around", "explore")
	fantasy_menu.add_menu_button("Search", "search")

func populate_info_content():
	var content = info_panel.get_content_container()
	
	# Structure description
	var desc_label = create_info_label(get_structure_description())
	content.add_child(desc_label)
	
	# Population info
	if structure_data.has("population") and structure_data.population > 0:
		var pop_label = create_info_label("Population: " + str(structure_data.population))
		pop_label.add_theme_color_override("font_color", Color.LIGHT_GREEN)
		content.add_child(pop_label)
	
	# Services info
	if structure_data.has("services") and structure_data.services.size() > 0:
		var services_label = create_info_label("Services: " + ", ".join(structure_data.services))
		services_label.add_theme_color_override("font_color", Color.CYAN)
		content.add_child(services_label)

func create_info_label(text: String) -> Label:
	var label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", 12)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_color_override("font_shadow_color", Color.BLACK)
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size.y = 20
	return label

func get_structure_description() -> String:
	if structure_data.has("description"):
		return structure_data.description
	return "You find yourself inside this structure."

func update_content_for_structure():
	# Update UI based on the actual structure data
	if title_display:
		title_display.title_text = get_structure_title()
	
	# Clear and repopulate menu
	if fantasy_menu:
		fantasy_menu.clear_buttons()
		populate_menu_actions()
	
	# Update info panel
	if info_panel:
		# Clear existing content
		var content = info_panel.get_content_container()
		for child in content.get_children():
			child.queue_free()
		# Repopulate
		populate_info_content()

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"exit":
			exit_interior()
		"market":
			show_market_interface()
		"tavern":
			show_tavern_interface()
		"blacksmith":
			show_blacksmith_interface()
		"shop":
			show_shop_interface()
		"inn":
			show_inn_interface()
		"pray":
			handle_temple_prayer()
		"healing":
			handle_temple_healing()
		_:
			handle_generic_action(action, data)

func exit_interior():
	print("BaseInterior: Exiting interior...")
	exit_requested.emit()
	
	# Return to world map - find the StructureEventSystem in the current scene tree
	var event_system = find_structure_event_system()
	if event_system:
		event_system.exit_current_structure()
	else:
		# Fallback - return to main scene
		get_tree().change_scene_to_file("res://scenes/main.tscn")

func find_structure_event_system():
	"""Find StructureEventSystem in the scene tree"""
	# Check if we can access it through the main scene or World
	var main_scene = get_tree().get_first_node_in_group("main_scene")
	if main_scene and main_scene.has_method("get_node"):
		var event_system = main_scene.get_node_or_null("StructureEventSystem")
		if event_system:
			return event_system
	
	# Alternative: look for it in the scene tree
	var nodes = get_tree().get_nodes_in_group("structure_event_system")
	if nodes.size() > 0:
		return nodes[0]
	
	return null

func show_market_interface():
	print("Opening market interface...")
	# TODO: Implement market UI

func show_tavern_interface():
	print("Entering the tavern...")
	# TODO: Implement tavern UI

func show_blacksmith_interface():
	print("Visiting the blacksmith...")
	# TODO: Implement blacksmith UI

func show_shop_interface():
	print("Browsing the shop...")
	# TODO: Implement shop UI

func show_inn_interface():
	print("Checking into the inn...")
	# TODO: Implement inn UI

func handle_temple_prayer():
	print("You offer a prayer...")
	# TODO: Implement prayer mechanics

func handle_temple_healing():
	print("You seek healing...")
	# TODO: Implement healing mechanics

func handle_generic_action(action: String, data: Dictionary):
	print("BaseInterior: Handling action: ", action)
	action_selected.emit(action, data)