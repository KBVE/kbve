extends Node

const TILE_SIZE = 32
const MAP_WIDTH = 64
const MAP_HEIGHT = 64

var map: Node
var npcs: Array[NPC] = []
var dragons: Array[DragonNPC] = []
var max_dragons: int = 3
var structure_pool: StructurePool

func _ready():
	map = Map
	
	# Initialize structure pool
	structure_pool = StructurePool.new()
	structure_pool.name = "StructurePool"
	add_child(structure_pool)

func get_tile_at(x: int, y: int) -> String:
	return map.get_tile(x, y)

func set_tile_at(x: int, y: int, color: String):
	map.set_tile(x, y, color)

func is_valid_position(x: int, y: int) -> bool:
	return map.is_valid_position(x, y) and map.is_tile_passable(x, y)

func get_neighbors_at(x: int, y: int) -> Array:
	return map.get_neighbors(x, y)

func get_map_size() -> Vector2i:
	return map.map_size

func spawn_npcs(count: int = 20):
	# Clear existing NPCs and dragons
	clear_npcs()
	
	# Spawn 3 dragons
	spawn_initial_dragons()
	
	# Try to spawn enemy ships from structures first
	spawn_npcs_from_structures(count)
	
	# Fill remaining count with random spawns if needed
	if npcs.size() < count:
		spawn_remaining_npcs_randomly(count)

func spawn_npcs_from_structures(target_count: int):
	if not structure_pool:
		return
	
	var structures = structure_pool.get_all_structures()
	var ships_per_structure = max(1, target_count / max(1, structures.size()))
	
	print("Spawning enemy ships from ", structures.size(), " structures (", ships_per_structure, " per structure)")
	
	for structure in structures:
		# Skip ruins and temples (peaceful structures)
		if structure.type in [StructurePool.StructureType.RUINS, StructurePool.StructureType.TEMPLE]:
			continue
		
		# Spawn ships around this structure
		for i in range(ships_per_structure):
			if npcs.size() >= target_count:
				break
			
			var spawn_pos = find_spawn_near_structure(structure)
			if spawn_pos != Vector2i(-1, -1):
				create_npc_at(spawn_pos)

func find_spawn_near_structure(structure: StructurePool.Structure) -> Vector2i:
	var attempts = 0
	var max_attempts = 20
	
	while attempts < max_attempts:
		attempts += 1
		
		# Spawn within 3-8 tiles of the structure
		var distance = randi_range(3, 8)
		var angle = randf() * 2 * PI
		var offset_x = int(cos(angle) * distance)
		var offset_y = int(sin(angle) * distance)
		
		var spawn_pos = Vector2i(
			structure.grid_position.x + structure.size.x / 2 + offset_x,
			structure.grid_position.y + structure.size.y / 2 + offset_y
		)
		
		if is_valid_npc_spawn(spawn_pos):
			return spawn_pos
	
	return Vector2i(-1, -1)

func spawn_remaining_npcs_randomly(target_count: int):
	var spawn_attempts = 0
	var max_attempts = (target_count - npcs.size()) * 10
	
	print("Filling remaining ships randomly. Need ", target_count - npcs.size(), " more ships.")
	
	while npcs.size() < target_count and spawn_attempts < max_attempts:
		spawn_attempts += 1
		
		# Random position
		var spawn_x = randi_range(5, MAP_WIDTH - 5)
		var spawn_y = randi_range(5, MAP_HEIGHT - 5)
		var spawn_pos = Vector2i(spawn_x, spawn_y)
		
		# Check if position is valid for NPC spawn
		if is_valid_npc_spawn(spawn_pos):
			create_npc_at(spawn_pos)

func is_valid_npc_spawn(pos: Vector2i) -> bool:
	# Check if tile is passable
	if not is_valid_position(pos.x, pos.y):
		return false
	
	# Check if position is occupied by a structure
	if structure_pool and structure_pool.get_structure_at_position(pos):
		return false
	
	# Check distance from player spawn (center)
	var center = Vector2i(MAP_WIDTH / 2, MAP_HEIGHT / 2)
	var distance = abs(pos.x - center.x) + abs(pos.y - center.y)
	if distance < 10:  # Don't spawn too close to player start
		return false
	
	# Check if another NPC is nearby
	for npc in npcs:
		var npc_distance = abs(pos.x - npc.grid_position.x) + abs(pos.y - npc.grid_position.y)
		if npc_distance < 5:  # NPCs should be spread out
			return false
	
	return true

func create_npc_at(pos: Vector2i):
	# Load the navy airship scene instead of creating script-based NPC
	var navy_airship_scene = preload("res://scenes/entities/ships/navy/navy_airship.tscn")
	var npc = navy_airship_scene.instantiate()
	npc.initialize(pos)
	# Connect death signal to handle respawning
	npc.connect("tree_exiting", _on_npc_died.bind(npc))
	npcs.append(npc)
	print("Created Navy Airship at position: ", pos, " - Total NPCs: ", npcs.size())

func spawn_initial_dragons():
	for i in range(max_dragons):
		spawn_single_dragon()

func spawn_single_dragon():
	var spawn_attempts = 0
	var max_attempts = 50
	
	while spawn_attempts < max_attempts:
		spawn_attempts += 1
		
		var spawn_pos = get_dragon_spawn_position()
		
		if is_valid_dragon_spawn(spawn_pos):
			create_dragon_at(spawn_pos)
			break

func get_dragon_spawn_position() -> Vector2i:
	# Spawn from map edges for respawning dragons
	var edge_choice = randi() % 4
	var spawn_pos: Vector2i
	
	match edge_choice:
		0:  # Top edge
			spawn_pos = Vector2i(randi_range(10, MAP_WIDTH - 10), randi_range(0, 5))
		1:  # Right edge
			spawn_pos = Vector2i(randi_range(MAP_WIDTH - 5, MAP_WIDTH - 1), randi_range(10, MAP_HEIGHT - 10))
		2:  # Bottom edge
			spawn_pos = Vector2i(randi_range(10, MAP_WIDTH - 10), randi_range(MAP_HEIGHT - 5, MAP_HEIGHT - 1))
		3:  # Left edge
			spawn_pos = Vector2i(randi_range(0, 5), randi_range(10, MAP_HEIGHT - 10))
	
	return spawn_pos

func is_valid_dragon_spawn(pos: Vector2i) -> bool:
	if pos.x < 0 or pos.x >= MAP_WIDTH or pos.y < 0 or pos.y >= MAP_HEIGHT:
		return false
	
	# Check distance from other dragons
	for existing_dragon in dragons:
		if existing_dragon and is_instance_valid(existing_dragon):
			var distance = abs(pos.x - existing_dragon.grid_position.x) + abs(pos.y - existing_dragon.grid_position.y)
			if distance < 15:  # Keep dragons spread out
				return false
	
	return true

func create_dragon_at(pos: Vector2i):
	# Load the red dragon scene instead of creating script-based dragon
	var red_dragon_scene = preload("res://scenes/entities/dragons/red_dragon.tscn")
	var new_dragon = red_dragon_scene.instantiate()
	new_dragon.initialize(pos)
	new_dragon.connect("dragon_died", _on_dragon_died)
	dragons.append(new_dragon)
	print("Created Red Dragon at position: ", pos, " - Total dragons: ", dragons.size())

func _on_dragon_died(dead_dragon: DragonNPC):
	# Remove dead dragon from array
	dragons.erase(dead_dragon)
	print("Dragon died, remaining: ", dragons.size())
	
	# Spawn a new dragon if below max
	if dragons.size() < max_dragons:
		# Delay respawn slightly
		var respawn_timer = Timer.new()
		respawn_timer.wait_time = 3.0
		respawn_timer.one_shot = true
		respawn_timer.timeout.connect(func():
			spawn_single_dragon()
			respawn_timer.queue_free()
		)
		add_child(respawn_timer)
		respawn_timer.start()
		print("New dragon will respawn in 3 seconds")

func clear_npcs():
	for npc in npcs:
		if npc and is_instance_valid(npc):
			npc.queue_free()
	npcs.clear()
	
	# Clear all dragons
	for dragon in dragons:
		if dragon and is_instance_valid(dragon):
			dragon.queue_free()
	dragons.clear()

func get_npcs() -> Array[NPC]:
	return npcs

func get_dragons() -> Array[DragonNPC]:
	return dragons

func get_all_entities() -> Array[NPC]:
	var all_entities: Array[NPC] = []
	all_entities.append_array(npcs)
	for dragon in dragons:
		all_entities.append(dragon)
	return all_entities

# Structure system integration
func initialize_world():
	"""Initialize the complete world system - call this after map generation"""
	if structure_pool:
		structure_pool.initialize_structures()
	
	print("World initialization complete")

func get_structure_at(pos: Vector2i):
	"""Get structure at position, if any"""
	if structure_pool:
		return structure_pool.get_structure_at_position(pos)
	return null

func get_player_structure_interactions(player_pos: Vector2i) -> Array:
	"""Get structures the player can interact with"""
	if structure_pool:
		return structure_pool.check_player_interactions(player_pos)
	return []

func interact_with_structure_at(pos: Vector2i, player: Node):
	"""Interact with structure at position"""
	if structure_pool:
		var structure = structure_pool.get_structure_at_position(pos)
		if structure:
			structure_pool.interact_with_structure(structure, player)

func get_all_structures() -> Array:
	"""Get all active structures"""
	if structure_pool:
		return structure_pool.get_all_structures()
	return []

func _on_npc_died(dead_npc: NPC):
	# Remove dead NPC from array
	npcs.erase(dead_npc)
	print("Enemy ship died, remaining: ", npcs.size())
	
	# Maintain pool of 20 ships by spawning a replacement
	if npcs.size() < 20:
		# Delay respawn slightly
		var respawn_timer = Timer.new()
		respawn_timer.wait_time = 2.0
		respawn_timer.one_shot = true
		respawn_timer.timeout.connect(func():
			respawn_single_npc()
			respawn_timer.queue_free()
		)
		add_child(respawn_timer)
		respawn_timer.start()
		print("New enemy ship will respawn in 2 seconds")

func respawn_single_npc():
	# Try to spawn from structures first
	if structure_pool:
		var structures = structure_pool.get_all_structures()
		structures.shuffle()
		
		for structure in structures:
			# Skip peaceful structures
			if structure.type in [StructurePool.StructureType.RUINS, StructurePool.StructureType.TEMPLE]:
				continue
			
			var spawn_pos = find_spawn_near_structure(structure)
			if spawn_pos != Vector2i(-1, -1):
				create_npc_at(spawn_pos)
				return
	
	# Fallback to random spawn
	var attempts = 0
	while attempts < 50:
		attempts += 1
		var spawn_x = randi_range(5, MAP_WIDTH - 5)
		var spawn_y = randi_range(5, MAP_HEIGHT - 5)
		var spawn_pos = Vector2i(spawn_x, spawn_y)
		
		if is_valid_npc_spawn(spawn_pos):
			create_npc_at(spawn_pos)
			return

func get_structure_pool_stats() -> Dictionary:
	"""Get statistics about the structure pool"""
	if structure_pool:
		return structure_pool.get_pool_statistics()
	return {}
