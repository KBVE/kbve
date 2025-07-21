class_name StructurePool
extends Node

# Central manager for all world structures - handles spawning, interactions, and lifecycle

# Structure types
enum StructureType {
	CITY,
	CASTLE,
	VILLAGE,
	TOWER,
	RUINS,
	TEMPLE,
	FORTRESS,
	PORT
}

# Base structure class
class Structure:
	var id: String
	var name: String
	var type: StructureType
	var grid_position: Vector2i
	var size: Vector2i  # Width x Height in tiles
	var is_interactive: bool = true
	var is_enterable: bool = false
	var sprite: Node2D
	var interaction_range: int = 1
	var population: int = 0
	var description: String = ""
	var visual_data: Dictionary = {}
	
	# Interactive properties
	var shops: Array[String] = []
	var services: Array[String] = []
	var quests: Array[String] = []
	var guards: int = 0
	
	func _init(structure_id: String, structure_name: String, structure_type: StructureType):
		id = structure_id
		name = structure_name
		type = structure_type
		
		# Set default properties based on type
		setup_structure_defaults()
	
	func setup_structure_defaults():
		match type:
			StructureType.CITY:
				size = Vector2i(4, 4)
				population = randi_range(500, 2000)
				is_enterable = true
				shops = ["general_store", "blacksmith", "tavern", "market"]
				services = ["inn", "bank", "guild"]
				guards = randi_range(10, 30)
				description = "A bustling city with merchants and adventurers."
				
			StructureType.CASTLE:
				size = Vector2i(3, 3)
				population = randi_range(50, 200)
				is_enterable = true
				services = ["court", "treasury", "armory"]
				guards = randi_range(20, 50)
				description = "A fortified castle of noble lords."
				
			StructureType.VILLAGE:
				size = Vector2i(2, 2)
				population = randi_range(50, 300)
				is_enterable = true
				shops = ["general_store", "tavern"]
				services = ["inn"]
				guards = randi_range(2, 8)
				description = "A peaceful village with friendly folk."
				
			StructureType.TOWER:
				size = Vector2i(1, 1)
				population = randi_range(1, 5)
				is_enterable = true
				services = ["magic", "knowledge"]
				description = "A mysterious tower reaching toward the sky."
				
			StructureType.RUINS:
				size = Vector2i(2, 2)
				population = 0
				is_enterable = true
				services = ["treasure", "secrets"]
				description = "Ancient ruins hiding forgotten secrets."
				
			StructureType.TEMPLE:
				size = Vector2i(2, 2)
				population = randi_range(5, 20)
				is_enterable = true
				services = ["healing", "blessing", "sanctuary"]
				description = "A sacred temple offering divine services."
				
			StructureType.FORTRESS:
				size = Vector2i(3, 3)
				population = randi_range(100, 300)
				is_enterable = false  # Military fortress
				guards = randi_range(30, 80)
				description = "A military fortress controlling the region."
				
			StructureType.PORT:
				size = Vector2i(3, 2)
				population = randi_range(200, 800)
				is_enterable = true
				shops = ["ship_supplies", "tavern", "trade_post"]
				services = ["harbor", "customs", "inn"]
				guards = randi_range(5, 15)
				description = "A busy port connecting land and sea."
	
	func get_interaction_tiles() -> Array[Vector2i]:
		var tiles: Array[Vector2i] = []
		
		# Add tiles around the structure perimeter
		for x in range(grid_position.x - interaction_range, grid_position.x + size.x + interaction_range):
			for y in range(grid_position.y - interaction_range, grid_position.y + size.y + interaction_range):
				# Don't include tiles occupied by the structure itself
				if not is_tile_occupied(Vector2i(x, y)):
					tiles.append(Vector2i(x, y))
		
		return tiles
	
	func is_tile_occupied(tile_pos: Vector2i) -> bool:
		return (tile_pos.x >= grid_position.x and tile_pos.x < grid_position.x + size.x and
				tile_pos.y >= grid_position.y and tile_pos.y < grid_position.y + size.y)
	
	func get_occupied_tiles() -> Array[Vector2i]:
		var tiles: Array[Vector2i] = []
		for x in range(grid_position.x, grid_position.x + size.x):
			for y in range(grid_position.y, grid_position.y + size.y):
				tiles.append(Vector2i(x, y))
		return tiles
	
	func can_player_interact(player_pos: Vector2i) -> bool:
		if not is_interactive:
			return false
		
		var interaction_tiles = get_interaction_tiles()
		return player_pos in interaction_tiles
	
	func get_info_text() -> String:
		var info = name + "\n" + description
		if population > 0:
			info += "\nPopulation: " + str(population)
		if shops.size() > 0:
			info += "\nShops: " + ", ".join(shops)
		if services.size() > 0:
			info += "\nServices: " + ", ".join(services)
		return info

# Signals - defined after Structure class
signal structure_interacted(structure: Structure, player: Node)
signal structure_entered(structure: Structure, player: Node)  
signal structure_exited(structure: Structure, player: Node)

# Pool configuration
@export var max_structures: int = 12
@export var min_structure_distance: int = 10
@export var player_safe_zone_radius: int = 15

# Structure spawn weights (higher = more likely to spawn)
var structure_spawn_weights = {
	StructureType.VILLAGE: 4,
	StructureType.CITY: 2,
	StructureType.CASTLE: 2,
	StructureType.TOWER: 3,
	StructureType.RUINS: 3,
	StructureType.TEMPLE: 2,
	StructureType.FORTRESS: 1,
	StructureType.PORT: 2
}

# Pool state
var active_structures: Array[Structure] = []
var structure_lookup: Dictionary = {}  # position -> structure
var player_current_structure: Structure = null
var world_ref: Node = null

func _ready():
	world_ref = get_parent()
	print("StructurePool initialized with max structures: ", max_structures)

func initialize_structures():
	"""Initialize the structure pool and spawn structures across the world"""
	clear_all_structures()
	spawn_structure_pool()
	print("StructurePool spawned ", active_structures.size(), " structures")

func spawn_structure_pool():
	"""Spawn structures up to the maximum limit with weighted distribution"""
	var spawn_attempts = 0
	var max_spawn_attempts = max_structures * 25
	
	print("Spawning structure pool (max: ", max_structures, ")...")
	
	while active_structures.size() < max_structures and spawn_attempts < max_spawn_attempts:
		spawn_attempts += 1
		
		# Pick weighted structure type
		var structure_type = pick_weighted_structure_type()
		
		# Find valid spawn location
		var spawn_location = find_valid_spawn_location(structure_type)
		if spawn_location != Vector2i(-1, -1):
			var structure = create_structure(spawn_location, structure_type)
			if structure:
				add_structure_to_pool(structure)
		
		# Prevent infinite loops
		if spawn_attempts >= max_spawn_attempts:
			print("Reached max spawn attempts (", max_spawn_attempts, "), stopping with ", active_structures.size(), " structures")
			break

func pick_weighted_structure_type() -> StructureType:
	"""Select a structure type based on weighted probabilities"""
	var total_weight = 0
	for weight in structure_spawn_weights.values():
		total_weight += weight
	
	var random_value = randi_range(1, total_weight)
	var current_weight = 0
	
	for structure_type in structure_spawn_weights:
		current_weight += structure_spawn_weights[structure_type]
		if random_value <= current_weight:
			return structure_type
	
	return StructureType.VILLAGE  # Fallback

func find_valid_spawn_location(structure_type: StructureType) -> Vector2i:
	"""Find a valid location for the given structure type"""
	# Create temporary structure to get size info
	var temp_structure = Structure.new("temp", "temp", structure_type)
	var attempts = 0
	var max_attempts = 200
	
	while attempts < max_attempts:
		attempts += 1
		
		# Generate random position with margins
		var margin = max(temp_structure.size.x, temp_structure.size.y) + 2
		var spawn_x = randi_range(margin, World.MAP_WIDTH - margin)
		var spawn_y = randi_range(margin, World.MAP_HEIGHT - margin)
		var spawn_pos = Vector2i(spawn_x, spawn_y)
		
		if is_valid_spawn_location(spawn_pos, temp_structure):
			return spawn_pos
	
	print("Failed to find valid location for ", StructureType.keys()[structure_type], " after ", max_attempts, " attempts")
	return Vector2i(-1, -1)

func is_valid_spawn_location(pos: Vector2i, structure: Structure) -> bool:
	"""Validate if a structure can be placed at the given position"""
	
	# Check all tiles the structure would occupy
	for x in range(pos.x, pos.x + structure.size.x):
		for y in range(pos.y, pos.y + structure.size.y):
			# Bounds check
			if x < 0 or x >= World.MAP_WIDTH or y < 0 or y >= World.MAP_HEIGHT:
				return false
			
			# Ocean check - structures cannot be placed in ocean
			var tile_color = Map.get_tile(x, y)
			if tile_color == Map.tile_colors["ocean"]:
				return false
			
			# Check if tile is suitable for this structure type
			if not is_tile_suitable_for_structure(Vector2i(x, y), structure.type):
				return false
			
			# Check if already occupied by another structure
			if structure_lookup.has(Vector2i(x, y)):
				return false
	
	# Check distance from player spawn (world center)
	var world_center = Vector2i(World.MAP_WIDTH / 2, World.MAP_HEIGHT / 2)
	var distance_to_center = calculate_manhattan_distance(pos, world_center)
	if distance_to_center < player_safe_zone_radius:
		return false
	
	# Check distance from existing structures
	for existing_structure in active_structures:
		var structure_distance = calculate_structure_distance(pos, structure.size, existing_structure)
		if structure_distance < min_structure_distance:
			return false
	
	# Special validation for ports (need to be near water)
	if structure.type == StructureType.PORT:
		if not is_near_water(pos, structure.size):
			return false
	
	return true

func is_tile_suitable_for_structure(tile_pos: Vector2i, structure_type: StructureType) -> bool:
	"""Check if a tile can support the given structure type"""
	var tile_color = Map.get_tile(tile_pos.x, tile_pos.y)
	
	match structure_type:
		StructureType.PORT:
			# Ports prefer coastal areas
			return (tile_color == Map.tile_colors["sand"] or 
					tile_color == Map.tile_colors["grass"])
		
		StructureType.RUINS:
			# Ruins can be anywhere except water
			return (tile_color != Map.tile_colors["ocean"] and 
					tile_color != Map.tile_colors["lake"])
		
		StructureType.TOWER:
			# Towers prefer elevated or mystical locations
			return (tile_color == Map.tile_colors["mountain"] or
					tile_color == Map.tile_colors["forest"] or
					tile_color == Map.tile_colors["grass"])
		
		_:
			# Most structures prefer solid ground
			return (tile_color == Map.tile_colors["grass"] or 
					tile_color == Map.tile_colors["sand"] or 
					tile_color == Map.tile_colors["forest"])

func is_near_water(pos: Vector2i, size: Vector2i, water_distance: int = 2) -> bool:
	"""Check if structure position is within specified distance of water"""
	# Check around the structure's perimeter
	for x in range(pos.x - water_distance, pos.x + size.x + water_distance):
		for y in range(pos.y - water_distance, pos.y + size.y + water_distance):
			if x >= 0 and x < World.MAP_WIDTH and y >= 0 and y < World.MAP_HEIGHT:
				var tile_color = Map.get_tile(x, y)
				if tile_color == Map.tile_colors["ocean"] or tile_color == Map.tile_colors["lake"]:
					return true
	return false

func calculate_manhattan_distance(pos1: Vector2i, pos2: Vector2i) -> int:
	"""Calculate Manhattan distance between two positions"""
	return abs(pos1.x - pos2.x) + abs(pos1.y - pos2.y)

func calculate_structure_distance(pos1: Vector2i, size1: Vector2i, structure2: Structure) -> int:
	"""Calculate minimum distance between structure edges"""
	var min_distance = 999999
	
	# Check distance from all tiles of structure1 to all tiles of structure2
	for x1 in range(pos1.x, pos1.x + size1.x):
		for y1 in range(pos1.y, pos1.y + size1.y):
			for x2 in range(structure2.grid_position.x, structure2.grid_position.x + structure2.size.x):
				for y2 in range(structure2.grid_position.y, structure2.grid_position.y + structure2.size.y):
					var distance = calculate_manhattan_distance(Vector2i(x1, y1), Vector2i(x2, y2))
					min_distance = min(min_distance, distance)
	
	return min_distance

func create_structure(pos: Vector2i, structure_type: StructureType) -> Structure:
	"""Create a new structure instance"""
	var structure_id = "struct_" + str(active_structures.size())
	var structure_name = generate_structure_name(structure_type)
	
	var structure = Structure.new(structure_id, structure_name, structure_type)
	structure.grid_position = pos
	
	print("Created ", StructureType.keys()[structure_type], " '", structure_name, "' at ", pos)
	return structure

func add_structure_to_pool(structure: Structure):
	"""Add structure to the active pool and register its tiles"""
	active_structures.append(structure)
	
	# Register all occupied tiles in lookup
	for tile in structure.get_occupied_tiles():
		structure_lookup[tile] = structure
	
	# Create visual representation (placeholder for now)
	create_structure_visual(structure)

func create_structure_visual(structure: Structure):
	"""Create visual representation for structure (to be enhanced later)"""
	structure.visual_data = {
		"color": get_structure_color(structure.type),
		"symbol": get_structure_symbol(structure.type),
		"render_priority": get_structure_render_priority(structure.type)
	}

func get_structure_color(structure_type: StructureType) -> Color:
	match structure_type:
		StructureType.CITY: return Color.GOLD
		StructureType.CASTLE: return Color.DARK_GRAY
		StructureType.VILLAGE: return Color.BROWN
		StructureType.TOWER: return Color.PURPLE
		StructureType.RUINS: return Color.DIM_GRAY
		StructureType.TEMPLE: return Color.WHITE
		StructureType.FORTRESS: return Color.RED
		StructureType.PORT: return Color.CYAN
		_: return Color.GRAY

func get_structure_symbol(structure_type: StructureType) -> String:
	match structure_type:
		StructureType.CITY: return "🏙"
		StructureType.CASTLE: return "🏰"
		StructureType.VILLAGE: return "🏘"
		StructureType.TOWER: return "🗼"
		StructureType.RUINS: return "🏛"
		StructureType.TEMPLE: return "⛪"
		StructureType.FORTRESS: return "🏯"
		StructureType.PORT: return "⚓"
		_: return "🏗"

func get_structure_render_priority(structure_type: StructureType) -> int:
	match structure_type:
		StructureType.CITY: return 10
		StructureType.CASTLE: return 9
		StructureType.FORTRESS: return 8
		StructureType.PORT: return 7
		StructureType.TEMPLE: return 6
		StructureType.TOWER: return 5
		StructureType.VILLAGE: return 4
		StructureType.RUINS: return 3
		_: return 1

func generate_structure_name(structure_type: StructureType) -> String:
	"""Generate procedural names for structures"""
	var prefixes = {
		StructureType.CITY: ["Grand", "Royal", "Golden", "Ancient", "Mystic", "Silver"],
		StructureType.CASTLE: ["Castle", "Fortress", "Keep", "Stronghold", "Citadel", "Bastion"],
		StructureType.VILLAGE: ["", "", "", "", "", "Old"],  # Mostly simple names
		StructureType.TOWER: ["Tower of", "Spire of", "Observatory of", "Sanctum of", "Pinnacle of"],
		StructureType.RUINS: ["Ruins of", "Lost", "Forgotten", "Ancient", "Fallen"],
		StructureType.TEMPLE: ["Temple of", "Shrine of", "Sanctuary of", "Cathedral of", "Abbey of"],
		StructureType.FORTRESS: ["Fort", "Garrison", "Outpost", "Stronghold", "Rampart"],
		StructureType.PORT: ["Port", "Harbor", "Docks", "Bay", "Wharf"]
	}
	
	var suffixes = {
		StructureType.CITY: ["Haven", "Harbor", "Falls", "Gate", "Crossing", "Heights"],
		StructureType.CASTLE: ["Blackrock", "Ironhold", "Stormwind", "Darkbane", "Goldspire", "Ravencrest"],
		StructureType.VILLAGE: ["Millbrook", "Oakenford", "Greenhill", "Riverside", "Fairhaven", "Thornbury"],
		StructureType.TOWER: ["Wisdom", "Stars", "Secrets", "Elements", "Time", "Knowledge"],
		StructureType.RUINS: ["Eldoria", "Valthara", "Astoria", "Mythros", "Zephyria", "Lumina"],
		StructureType.TEMPLE: ["Light", "Dawn", "Serenity", "Truth", "Harmony", "Grace"],
		StructureType.FORTRESS: ["Ironwall", "Redrock", "Blackstone", "Goldwatch", "Stormguard", "Shadowhold"],
		StructureType.PORT: ["Saltwind", "Tidecrest", "Wavehaven", "Seahold", "Mistdock", "Coral"]
	}
	
	var prefix = prefixes[structure_type][randi() % prefixes[structure_type].size()]
	var suffix = suffixes[structure_type][randi() % suffixes[structure_type].size()]
	
	return suffix if prefix.is_empty() else prefix + " " + suffix

# Interaction system
func check_player_interactions(player_pos: Vector2i) -> Array[Structure]:
	"""Check what structures the player can interact with at their current position"""
	var interactable: Array[Structure] = []
	
	for structure in active_structures:
		if structure.can_player_interact(player_pos):
			interactable.append(structure)
	
	# Handle entering/exiting structures
	var current_structure = get_structure_at_position(player_pos)
	if current_structure != player_current_structure:
		if player_current_structure:
			structure_exited.emit(player_current_structure, null)
		if current_structure:
			structure_entered.emit(current_structure, null)
		player_current_structure = current_structure
	
	return interactable

func interact_with_structure(structure: Structure, player: Node):
	"""Handle player interaction with a structure"""
	print("Player interacting with ", structure.name)
	structure_interacted.emit(structure, player)

func get_structure_at_position(pos: Vector2i) -> Structure:
	"""Get the structure at a specific position, if any"""
	return structure_lookup.get(pos, null)

func get_structures_near_position(pos: Vector2i, radius: int = 5) -> Array[Structure]:
	"""Get all structures within a radius of the given position"""
	var nearby: Array[Structure] = []
	
	for structure in active_structures:
		var distance = calculate_manhattan_distance(pos, structure.grid_position)
		if distance <= radius:
			nearby.append(structure)
	
	return nearby

func get_structures_by_type(structure_type: StructureType) -> Array[Structure]:
	"""Get all structures of a specific type"""
	var filtered: Array[Structure] = []
	for structure in active_structures:
		if structure.type == structure_type:
			filtered.append(structure)
	return filtered

# Pool management
func clear_all_structures():
	"""Remove all structures from the pool"""
	for structure in active_structures:
		if structure.sprite and is_instance_valid(structure.sprite):
			structure.sprite.queue_free()
	
	active_structures.clear()
	structure_lookup.clear()
	player_current_structure = null
	print("StructurePool cleared")

func get_pool_statistics() -> Dictionary:
	"""Get statistics about the current structure pool"""
	var stats = {
		"total_structures": active_structures.size(),
		"max_capacity": max_structures,
		"utilization": float(active_structures.size()) / float(max_structures),
		"types": {}
	}
	
	# Count by type
	for structure in active_structures:
		var type_name = StructureType.keys()[structure.type]
		if not stats.types.has(type_name):
			stats.types[type_name] = 0
		stats.types[type_name] += 1
	
	return stats

func get_all_structures() -> Array[Structure]:
	"""Get reference to all active structures"""
	return active_structures

# Configuration
func set_max_structures(new_max: int):
	"""Update the maximum number of structures"""
	max_structures = new_max
	print("StructurePool max structures updated to: ", max_structures)

func set_structure_spawn_weight(structure_type: StructureType, weight: int):
	"""Update spawn weight for a structure type"""
	structure_spawn_weights[structure_type] = max(0, weight)
	print("Updated spawn weight for ", StructureType.keys()[structure_type], " to ", weight)
