extends Node

# Core structures system for cities, castles, and other interactive world structures

signal structure_interacted(structure: Structure, player: Node)
signal structure_entered(structure: Structure, player: Node)
signal structure_exited(structure: Structure, player: Node)

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

# Structure management
var structures: Array[Structure] = []
var structure_lookup: Dictionary = {}  # position -> structure
var player_current_structure: Structure = null

func _ready():
	print("Structures system initialized")

func spawn_structures(count: int = 8):
	clear_structures()
	
	var spawn_attempts = 0
	var max_attempts = count * 20
	
	print("Attempting to spawn ", count, " structures...")
	
	# Define structure types to spawn with weights
	var structure_types = [
		{type = StructureType.CITY, weight = 1},
		{type = StructureType.CASTLE, weight = 2},
		{type = StructureType.VILLAGE, weight = 3},
		{type = StructureType.TOWER, weight = 2},
		{type = StructureType.RUINS, weight = 2},
		{type = StructureType.TEMPLE, weight = 2},
		{type = StructureType.PORT, weight = 1}
	]
	
	while structures.size() < count and spawn_attempts < max_attempts:
		spawn_attempts += 1
		
		# Pick random structure type based on weights
		var structure_type = pick_weighted_structure_type(structure_types)
		
		# Find valid spawn location
		var spawn_pos = find_valid_spawn_location(structure_type)
		if spawn_pos != Vector2i(-1, -1):
			create_structure_at(spawn_pos, structure_type)
		
		# Break if we've made too many attempts
		if spawn_attempts >= max_attempts:
			print("Reached max spawn attempts, created ", structures.size(), " structures")
			break
	
	print("Successfully spawned ", structures.size(), " structures")

func pick_weighted_structure_type(types: Array) -> StructureType:
	var total_weight = 0
	for type_data in types:
		total_weight += type_data.weight
	
	var random_value = randi_range(1, total_weight)
	var current_weight = 0
	
	for type_data in types:
		current_weight += type_data.weight
		if random_value <= current_weight:
			return type_data.type
	
	return StructureType.VILLAGE  # Fallback

func find_valid_spawn_location(structure_type: StructureType) -> Vector2i:
	var temp_structure = Structure.new("temp", "temp", structure_type)
	var attempts = 0
	var max_attempts = 100
	
	while attempts < max_attempts:
		attempts += 1
		
		# Random position with some margin from edges
		var spawn_x = randi_range(10, World.MAP_WIDTH - 10 - temp_structure.size.x)
		var spawn_y = randi_range(10, World.MAP_HEIGHT - 10 - temp_structure.size.y)
		var spawn_pos = Vector2i(spawn_x, spawn_y)
		
		if is_valid_structure_spawn(spawn_pos, temp_structure):
			return spawn_pos
	
	return Vector2i(-1, -1)  # No valid location found

func is_valid_structure_spawn(pos: Vector2i, structure: Structure) -> bool:
	# Check if all tiles the structure would occupy are valid
	for x in range(pos.x, pos.x + structure.size.x):
		for y in range(pos.y, pos.y + structure.size.y):
			# Check bounds
			if x < 0 or x >= World.MAP_WIDTH or y < 0 or y >= World.MAP_HEIGHT:
				return false
			
			# Check if tile is suitable for structures
			if not is_tile_suitable_for_structure(Vector2i(x, y), structure.type):
				return false
			
			# Check if tile is already occupied by another structure
			if structure_lookup.has(Vector2i(x, y)):
				return false
	
	# Check distance from player spawn (center)
	var center = Vector2i(World.MAP_WIDTH / 2, World.MAP_HEIGHT / 2)
	var distance = abs(pos.x - center.x) + abs(pos.y - center.y)
	if distance < 15:  # Don't spawn too close to player start
		return false
	
	# Check distance from other structures
	for existing_structure in structures:
		var struct_distance = calculate_structure_distance(pos, structure.size, existing_structure)
		if struct_distance < get_minimum_structure_distance(structure.type, existing_structure.type):
			return false
	
	return true

func is_tile_suitable_for_structure(tile_pos: Vector2i, structure_type: StructureType) -> bool:
	var tile_color = Map.get_tile(tile_pos.x, tile_pos.y)
	
	match structure_type:
		StructureType.PORT:
			# Ports need to be adjacent to water
			return tile_color == Map.tile_colors["sand"] or tile_color == Map.tile_colors["grass"]
		StructureType.RUINS:
			# Ruins can be on most land tiles
			return tile_color != Map.tile_colors["ocean"] and tile_color != Map.tile_colors["lake"]
		_:
			# Most structures prefer grass, sand, or forest
			return (tile_color == Map.tile_colors["grass"] or 
					tile_color == Map.tile_colors["sand"] or 
					tile_color == Map.tile_colors["forest"])

func calculate_structure_distance(pos1: Vector2i, size1: Vector2i, structure2: Structure) -> int:
	# Calculate minimum distance between structure edges
	var min_dist = 999999
	
	for x1 in range(pos1.x, pos1.x + size1.x):
		for y1 in range(pos1.y, pos1.y + size1.y):
			for x2 in range(structure2.grid_position.x, structure2.grid_position.x + structure2.size.x):
				for y2 in range(structure2.grid_position.y, structure2.grid_position.y + structure2.size.y):
					var dist = abs(x1 - x2) + abs(y1 - y2)
					min_dist = min(min_dist, dist)
	
	return min_dist

func get_minimum_structure_distance(type1: StructureType, type2: StructureType) -> int:
	# Cities and castles need more space
	if type1 == StructureType.CITY or type2 == StructureType.CITY:
		return 15
	if type1 == StructureType.CASTLE or type2 == StructureType.CASTLE:
		return 12
	
	# Default minimum distance
	return 8

func create_structure_at(pos: Vector2i, structure_type: StructureType):
	var structure_id = "struct_" + str(structures.size())
	var structure_name = generate_structure_name(structure_type)
	
	var structure = Structure.new(structure_id, structure_name, structure_type)
	structure.grid_position = pos
	
	# Register structure tiles in lookup
	for tile in structure.get_occupied_tiles():
		structure_lookup[tile] = structure
	
	structures.append(structure)
	create_structure_visual(structure)
	
	print("Created ", StructureType.keys()[structure_type], " '", structure_name, "' at position: ", pos)

func generate_structure_name(structure_type: StructureType) -> String:
	var prefixes = {
		StructureType.CITY: ["Grand", "Royal", "Golden", "Ancient", "Mystic"],
		StructureType.CASTLE: ["Castle", "Fortress", "Keep", "Stronghold", "Citadel"],
		StructureType.VILLAGE: ["", "", "", "", ""],  # Villages use simple names
		StructureType.TOWER: ["Tower of", "Spire of", "Observatory of", "Sanctum of"],
		StructureType.RUINS: ["Ruins of", "Lost", "Forgotten", "Ancient"],
		StructureType.TEMPLE: ["Temple of", "Shrine of", "Sanctuary of", "Cathedral of"],
		StructureType.FORTRESS: ["Fort", "Garrison", "Outpost", "Stronghold"],
		StructureType.PORT: ["Port", "Harbor", "Docks", "Bay"]
	}
	
	var suffixes = {
		StructureType.CITY: ["Haven", "Harbor", "Falls", "Gate", "Crossing"],
		StructureType.CASTLE: ["Blackrock", "Ironhold", "Stormwind", "Darkbane", "Goldspire"],
		StructureType.VILLAGE: ["Millbrook", "Oakenford", "Greenhill", "Riverside", "Fairhaven"],
		StructureType.TOWER: ["Wisdom", "Stars", "Secrets", "Elements", "Time"],
		StructureType.RUINS: ["Eldoria", "Valthara", "Astoria", "Mythros", "Zephyria"],
		StructureType.TEMPLE: ["Light", "Dawn", "Serenity", "Truth", "Harmony"],
		StructureType.FORTRESS: ["Ironwall", "Redrock", "Blackstone", "Goldwatch", "Stormguard"],
		StructureType.PORT: ["Saltwind", "Tidecrest", "Wavehaven", "Seahold", "Mistdock"]
	}
	
	var prefix = prefixes[structure_type][randi() % prefixes[structure_type].size()]
	var suffix = suffixes[structure_type][randi() % suffixes[structure_type].size()]
	
	if prefix.is_empty():
		return suffix
	else:
		return prefix + " " + suffix

func create_structure_visual(structure: Structure):
	# This will be expanded later with actual sprite rendering
	# For now, we'll just store visual data
	structure.visual_data = {
		"color": get_structure_color(structure.type),
		"symbol": get_structure_symbol(structure.type)
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

func get_structure_at(pos: Vector2i) -> Structure:
	return structure_lookup.get(pos, null)

func get_structures_near(pos: Vector2i, radius: int = 5) -> Array[Structure]:
	var nearby: Array[Structure] = []
	
	for structure in structures:
		var distance = calculate_structure_distance(pos, Vector2i(1, 1), structure)
		if distance <= radius:
			nearby.append(structure)
	
	return nearby

func check_player_interaction(player_pos: Vector2i):
	var interactable_structures = []
	
	for structure in structures:
		if structure.can_player_interact(player_pos):
			interactable_structures.append(structure)
	
	# Handle entering/exiting structures
	var current_structure = get_structure_at(player_pos)
	if current_structure != player_current_structure:
		if player_current_structure:
			structure_exited.emit(player_current_structure, null)
		if current_structure:
			structure_entered.emit(current_structure, null)
		player_current_structure = current_structure
	
	return interactable_structures

func interact_with_structure(structure: Structure, player: Node):
	print("Interacting with ", structure.name)
	structure_interacted.emit(structure, player)

func clear_structures():
	for structure in structures:
		if structure.sprite and is_instance_valid(structure.sprite):
			structure.sprite.queue_free()
	
	structures.clear()
	structure_lookup.clear()
	player_current_structure = null

func get_all_structures() -> Array[Structure]:
	return structures

func get_structures_by_type(structure_type: StructureType) -> Array[Structure]:
	var filtered: Array[Structure] = []
	for structure in structures:
		if structure.type == structure_type:
			filtered.append(structure)
	return filtered