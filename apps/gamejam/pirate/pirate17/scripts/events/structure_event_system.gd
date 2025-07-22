class_name StructureEventSystem
extends Node

# Singleton for handling structure interaction events and scene transitions

signal structure_entered(structure_type: StructurePool.StructureType, structure_data: Dictionary)
signal structure_exited(structure_type: StructurePool.StructureType, structure_data: Dictionary)
signal scene_transition_requested(scene_path: String, transition_data: Dictionary)
signal scene_transition_completed(previous_scene: String, current_scene: String)

# Scene mapping for different structure types
const STRUCTURE_SCENES = {
	StructurePool.StructureType.CITY: "res://scenes/interiors/city_interior.tscn",
	StructurePool.StructureType.CASTLE: "res://scenes/interiors/castle_interior.tscn",
	StructurePool.StructureType.VILLAGE: "res://scenes/interiors/village_interior.tscn",
	StructurePool.StructureType.TOWER: "res://scenes/interiors/tower_interior.tscn",
	StructurePool.StructureType.RUINS: "res://scenes/interiors/ruins_interior.tscn",
	StructurePool.StructureType.TEMPLE: "res://scenes/interiors/temple_interior.tscn",
	StructurePool.StructureType.FORTRESS: "res://scenes/interiors/fortress_interior.tscn",
	StructurePool.StructureType.PORT: "res://scenes/interiors/port_interior.tscn"
}

var current_structure = null
var previous_scene_path: String = ""
var player_world_position: Vector2i = Vector2i.ZERO

func _ready():
	# Connect to structure pool signals
	connect_structure_signals()

func connect_structure_signals():
	# Connect to World/StructurePool signals when they're available
	if World and World.structure_pool:
		if not World.structure_pool.structure_entered.is_connected(_on_structure_entered):
			World.structure_pool.structure_entered.connect(_on_structure_entered)
		if not World.structure_pool.structure_exited.is_connected(_on_structure_exited):
			World.structure_pool.structure_exited.connect(_on_structure_exited)
		if not World.structure_pool.structure_interacted.is_connected(_on_structure_interacted):
			World.structure_pool.structure_interacted.connect(_on_structure_interacted)
		print("StructureEventSystem: Connected to structure pool signals")
	else:
		print("StructureEventSystem: World.structure_pool not available yet, will retry...")
		# Retry connection after a short delay
		call_deferred("_retry_structure_connections")

func _retry_structure_connections():
	await get_tree().process_frame  # Wait one frame
	if World and World.structure_pool:
		connect_structure_signals()

func _on_structure_entered(structure, player):
	print("StructureEventSystem: Player entered ", structure.name)
	current_structure = structure
	structure_entered.emit(structure.type, get_structure_data(structure))

func _on_structure_exited(structure, player):
	print("StructureEventSystem: Player exited ", structure.name)
	structure_exited.emit(structure.type, get_structure_data(structure))
	current_structure = null

func _on_structure_interacted(structure, player):
	print("StructureEventSystem: Player interacted with ", structure.name)
	
	if structure.is_enterable:
		enter_structure(structure, player)
	else:
		# Handle non-enterable interactions (trade, talk, etc.)
		handle_structure_interaction(structure, player)

func enter_structure(structure, player):
	"""Handle entering a structure - transition to interior scene"""
	if not structure.is_enterable:
		print("StructureEventSystem: Structure ", structure.name, " is not enterable")
		return
	
	# Store current world state
	store_world_state(player)
	
	# Get the appropriate scene path
	var scene_path = get_structure_scene_path(structure.type)
	
	if scene_path.is_empty():
		print("StructureEventSystem: No scene found for structure type: ", structure.type)
		create_fallback_interior_scene(structure)
		return
	
	# Prepare transition data
	var transition_data = {
		"structure": structure,
		"structure_data": get_structure_data(structure),
		"player_world_position": player_world_position,
		"previous_scene": get_tree().current_scene.scene_file_path
	}
	
	print("StructureEventSystem: Transitioning to ", scene_path)
	scene_transition_requested.emit(scene_path, transition_data)
	
	# Actually perform the scene transition
	perform_scene_transition(scene_path, transition_data)

func handle_structure_interaction(structure, player):
	"""Handle non-enterable structure interactions"""
	print("StructureEventSystem: Handling interaction with ", structure.name)
	
	# Different interaction types based on structure
	match structure.type:
		StructurePool.StructureType.FORTRESS:
			show_fortress_interaction(structure)
		StructurePool.StructureType.RUINS:
			show_ruins_interaction(structure)
		_:
			show_generic_interaction(structure)

func show_fortress_interaction(structure):
	print("You approach the fortress gates. The guards eye you suspiciously.")
	print("Guards: ", structure.guards)
	# TODO: Implement fortress interaction UI

func show_ruins_interaction(structure):
	print("You examine the ancient ruins. There might be treasure hidden here...")
	print("Services: ", structure.services)
	# TODO: Implement ruins exploration system

func show_generic_interaction(structure):
	print("You interact with ", structure.name)
	print("Description: ", structure.description)
	# TODO: Implement generic interaction UI

func get_structure_scene_path(structure_type: StructurePool.StructureType) -> String:
	"""Get the scene path for a structure type"""
	if structure_type in STRUCTURE_SCENES:
		return STRUCTURE_SCENES[structure_type]
	return ""

func store_world_state(player):
	"""Store the current world state before transitioning"""
	if player and hasattr(player, "position"):
		player_world_position = Movement.get_grid_position(player.position)
	previous_scene_path = get_tree().current_scene.scene_file_path
	
	print("StructureEventSystem: Stored world state - Player at: ", player_world_position)

func perform_scene_transition(scene_path: String, transition_data: Dictionary):
	"""Actually perform the scene transition"""
	# Store transition data for the new scene to access
	var scene_resource = load(scene_path)
	if scene_resource:
		var result = get_tree().change_scene_to_packed(scene_resource)
		if result == OK:
			print("StructureEventSystem: Successfully transitioned to ", scene_path)
			scene_transition_completed.emit(previous_scene_path, scene_path)
			
			# Pass structure data to the new scene when it's ready
			call_deferred("_setup_new_scene_data", transition_data)
		else:
			print("StructureEventSystem: Failed to transition to ", scene_path, " - Error: ", result)
			create_fallback_interior_scene(transition_data.structure)
	else:
		print("StructureEventSystem: Could not load scene resource: ", scene_path)
		create_fallback_interior_scene(transition_data.structure)

func _setup_new_scene_data(transition_data: Dictionary):
	"""Pass structure data to the newly loaded interior scene"""
	var current_scene = get_tree().current_scene
	if current_scene and current_scene.has_method("set_meta"):
		current_scene.set_meta("structure_data", transition_data.structure_data)
		if current_scene.has_method("update_content_for_structure"):
			current_scene.update_content_for_structure()

func create_fallback_interior_scene(structure):
	"""Create a simple fallback interior when no scene file exists"""
	print("StructureEventSystem: Creating fallback interior for ", structure.name)
	
	# TODO: Create a simple procedural interior scene
	# For now, just print structure info
	print("=== ENTERING ", structure.name.to_upper(), " ===")
	print(structure.get_info_text())
	print("Press ESC or Enter to exit")
	print("=====================================")

func exit_current_structure():
	"""Return to the world map from an interior"""
	if previous_scene_path.is_empty():
		previous_scene_path = "res://scenes/main.tscn"  # Fallback to main scene
	
	print("StructureEventSystem: Returning to world at ", previous_scene_path)
	get_tree().change_scene_to_file(previous_scene_path)

func get_structure_data(structure) -> Dictionary:
	"""Extract relevant data from a structure for events"""
	return {
		"id": structure.id,
		"name": structure.name,
		"type": structure.type,
		"position": structure.grid_position,
		"size": structure.size,
		"population": structure.population,
		"shops": structure.shops,
		"services": structure.services,
		"description": structure.description,
		"is_enterable": structure.is_enterable
	}

func hasattr(obj, property: String) -> bool:
	"""Helper function to check if object has a property"""
	return obj.has_method("get") and obj.get(property) != null
