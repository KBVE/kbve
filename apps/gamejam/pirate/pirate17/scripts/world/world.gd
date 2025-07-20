extends Node

const TILE_SIZE = 32
const MAP_WIDTH = 64
const MAP_HEIGHT = 64

var map: Node
var npcs: Array[NPC] = []

func _ready():
	map = Map

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

func spawn_npcs(count: int = 15):
	# Clear existing NPCs
	clear_npcs()
	
	var spawn_attempts = 0
	var max_attempts = count * 10
	
	print("Attempting to spawn ", count, " NPCs...")
	
	while npcs.size() < count and spawn_attempts < max_attempts:
		spawn_attempts += 1
		
		# Random position
		var spawn_x = randi_range(5, MAP_WIDTH - 5)
		var spawn_y = randi_range(5, MAP_HEIGHT - 5)
		var spawn_pos = Vector2i(spawn_x, spawn_y)
		
		print("Spawn attempt ", spawn_attempts, " at position: ", spawn_pos)
		
		# Check if position is valid for NPC spawn
		if is_valid_npc_spawn(spawn_pos):
			print("Position is valid, creating NPC")
			create_npc_at(spawn_pos)
		else:
			print("Position rejected")

func is_valid_npc_spawn(pos: Vector2i) -> bool:
	# Check if tile is passable
	if not is_valid_position(pos.x, pos.y):
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
	var npc = NPC.new()
	npc.initialize(pos)
	npcs.append(npc)
	print("Created NPC at position: ", pos, " - Total NPCs: ", npcs.size())

func clear_npcs():
	for npc in npcs:
		if npc and is_instance_valid(npc):
			npc.queue_free()
	npcs.clear()

func get_npcs() -> Array[NPC]:
	return npcs