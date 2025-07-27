class_name ChunkManager
extends RefCounted

const CHUNK_SIZE = 16
var VIEW_DISTANCE = 3  # Now dynamic for performance scaling
const TILE_SIZE = 32
var web_optimized = false

class Chunk:
	var position: Vector2i
	var tiles: Dictionary = {}
	var sprites: Dictionary = {}
	var is_loaded: bool = false
	var bounds: Rect2i
	
	func _init(chunk_pos: Vector2i):
		position = chunk_pos
		var world_pos = chunk_pos * CHUNK_SIZE
		bounds = Rect2i(world_pos, Vector2i(CHUNK_SIZE, CHUNK_SIZE))
	
	func get_world_position(local_pos: Vector2i) -> Vector2i:
		return position * CHUNK_SIZE + local_pos
	
	func contains_world_position(world_pos: Vector2i) -> bool:
		return bounds.has_point(world_pos)

var loaded_chunks: Dictionary = {}
var chunk_container: Node2D

var map_ref: Node
var world_ref: Node

var ocean_tiles: Array[Node2D] = []
var ocean_animation_timer: float = 0.0

# NPC management
var npcs_by_chunk: Dictionary = {}  # chunk_pos -> Array[NPC]
var active_npcs: Array = []

func _init():
	print("ChunkManager initialized")

func setup(map_node: Node, world_node: Node, container: Node2D):
	"""Initialize chunk manager with required references"""
	map_ref = map_node
	world_ref = world_node
	chunk_container = container
	
	# Always enable browser optimizations for web-only game
	enable_web_optimizations()

func enable_web_optimizations():
	"""Enable browser optimizations - always active for web-only game"""
	web_optimized = true
	VIEW_DISTANCE = 2  # Optimized view distance for browser performance
	print("ChunkManager: Browser optimizations enabled - view distance set to ", VIEW_DISTANCE)

func set_view_distance(distance: int):
	"""Dynamically adjust view distance for performance scaling"""
	VIEW_DISTANCE = distance
	print("ChunkManager: View distance set to ", VIEW_DISTANCE)

func world_to_chunk_position(world_pos: Vector2i) -> Vector2i:
	"""Convert world tile position to chunk position"""
	return Vector2i(
		int(floor(float(world_pos.x) / CHUNK_SIZE)),
		int(floor(float(world_pos.y) / CHUNK_SIZE))
	)

func get_chunk_at_world_position(world_pos: Vector2i) -> Chunk:
	"""Get chunk containing the given world position"""
	var chunk_pos = world_to_chunk_position(world_pos)
	return loaded_chunks.get(chunk_pos)

func update_chunks_around_player(player_grid_pos: Vector2i):
	"""Load chunks around player and unload distant chunks"""
	var player_chunk_pos = world_to_chunk_position(player_grid_pos)
	
	var chunks_to_load = []
	for x in range(-VIEW_DISTANCE, VIEW_DISTANCE + 1):
		for y in range(-VIEW_DISTANCE, VIEW_DISTANCE + 1):
			var chunk_pos = player_chunk_pos + Vector2i(x, y)
			var chunk_world_start = chunk_pos * CHUNK_SIZE
			if chunk_world_start.x >= 0 and chunk_world_start.y >= 0 and \
			   chunk_world_start.x < map_ref.map_size.x and chunk_world_start.y < map_ref.map_size.y:
				chunks_to_load.append(chunk_pos)
	
	var chunks_to_unload = []
	for chunk_pos in loaded_chunks:
		if chunk_pos not in chunks_to_load:
			chunks_to_unload.append(chunk_pos)
	
	for chunk_pos in chunks_to_unload:
		unload_chunk(chunk_pos)
	
	for chunk_pos in chunks_to_load:
		if chunk_pos not in loaded_chunks:
			load_chunk(chunk_pos)

func load_chunk(chunk_pos: Vector2i):
	"""Load a chunk and create its sprites"""
	var chunk = Chunk.new(chunk_pos)
	
	for x in range(CHUNK_SIZE):
		for y in range(CHUNK_SIZE):
			var local_pos = Vector2i(x, y)
			var world_pos = chunk.get_world_position(local_pos)
			
			if world_pos.x >= map_ref.map_size.x or world_pos.y >= map_ref.map_size.y:
				continue
			
			var tile_color = map_ref.get_tile(world_pos.x, world_pos.y)
			if tile_color != "":
				var sprite = create_tile_sprite(world_pos, tile_color)
				if sprite:
					chunk_container.add_child(sprite)
					chunk.sprites[local_pos] = sprite
					chunk.tiles[local_pos] = tile_color
	
	chunk.is_loaded = true
	loaded_chunks[chunk_pos] = chunk
	print("Loaded chunk at ", chunk_pos, " with ", chunk.sprites.size(), " tiles")

func unload_chunk(chunk_pos: Vector2i):
	"""Unload a chunk and free its sprites"""
	var chunk = loaded_chunks.get(chunk_pos)
	if not chunk:
		return
	
	for sprite in chunk.sprites.values():
		if sprite and is_instance_valid(sprite):
			if sprite in ocean_tiles:
				ocean_tiles.erase(sprite)
			sprite.queue_free()
	
	loaded_chunks.erase(chunk_pos)
	print("Unloaded chunk at ", chunk_pos)

func create_tile_sprite(world_pos: Vector2i, color_hex: String) -> Node2D:
	"""Create a sprite for a tile"""
	var tile_position = Vector2(world_pos.x * TILE_SIZE, world_pos.y * TILE_SIZE)
	
	var tile_node = Node2D.new()
	tile_node.position = tile_position
	tile_node.z_index = -1
	
	var rect = ColorRect.new()
	rect.size = Vector2(TILE_SIZE, TILE_SIZE)
	rect.color = Color(color_hex)
	tile_node.add_child(rect)
	
	if color_hex == map_ref.tile_colors["ocean"]:
		rect.modulate.a = 0.9
	
	return tile_node

func update_ocean_animation(delta: float):
	"""Update ocean tile animations"""
	ocean_animation_timer += delta
	if ocean_animation_timer > 10.0:
		ocean_animation_timer = 0.0
		for tile in ocean_tiles:
			if randf() < 0.1 and is_instance_valid(tile):
				tile.speed_scale = randf_range(0.8, 1.2)

func get_loaded_chunk_count() -> int:
	"""Get number of currently loaded chunks"""
	return loaded_chunks.size()

func get_total_sprite_count() -> int:
	"""Get total number of sprites across all chunks"""
	var count = 0
	for chunk in loaded_chunks.values():
		count += chunk.sprites.size()
	return count

func register_npc(npc: NPC):
	"""Register an NPC with the chunk system"""
	if not npc:
		return
		
	npc.update_chunk_position()
	var chunk_pos = npc.chunk_position
	
	if not npcs_by_chunk.has(chunk_pos):
		npcs_by_chunk[chunk_pos] = []
	
	if not npc in npcs_by_chunk[chunk_pos]:
		npcs_by_chunk[chunk_pos].append(npc)

func unregister_npc(npc: NPC):
	"""Remove an NPC from the chunk system"""
	if not npc:
		return
		
	var chunk_pos = npc.chunk_position
	if npcs_by_chunk.has(chunk_pos):
		npcs_by_chunk[chunk_pos].erase(npc)
		if npcs_by_chunk[chunk_pos].is_empty():
			npcs_by_chunk.erase(chunk_pos)
	
	active_npcs.erase(npc)

func update_npc_chunk(npc: NPC, old_chunk: Vector2i):
	"""Update NPC's chunk when it moves"""
	if not npc:
		return
		
	# Remove from old chunk
	if npcs_by_chunk.has(old_chunk):
		npcs_by_chunk[old_chunk].erase(npc)
		if npcs_by_chunk[old_chunk].is_empty():
			npcs_by_chunk.erase(old_chunk)
	
	# Add to new chunk
	npc.update_chunk_position()
	var new_chunk = npc.chunk_position
	
	if not npcs_by_chunk.has(new_chunk):
		npcs_by_chunk[new_chunk] = []
	
	if not npc in npcs_by_chunk[new_chunk]:
		npcs_by_chunk[new_chunk].append(npc)

func update_npc_activation(player_chunk_pos: Vector2i):
	"""Activate/deactivate NPCs based on player position"""
	var chunks_in_range = []
	
	# Get all chunks that should have active NPCs
	for x in range(-VIEW_DISTANCE, VIEW_DISTANCE + 1):
		for y in range(-VIEW_DISTANCE, VIEW_DISTANCE + 1):
			var chunk_pos = player_chunk_pos + Vector2i(x, y)
			chunks_in_range.append(chunk_pos)
	
	# Activate NPCs in range
	for chunk_pos in chunks_in_range:
		if npcs_by_chunk.has(chunk_pos):
			for npc in npcs_by_chunk[chunk_pos]:
				if is_instance_valid(npc) and not npc.is_active:
					npc.activate()
					if not npc in active_npcs:
						active_npcs.append(npc)
	
	# Deactivate NPCs out of range (but keep dragons always active)
	var npcs_to_deactivate = []
	for npc in active_npcs:
		if is_instance_valid(npc) and not npc.chunk_position in chunks_in_range:
			# Don't deactivate dragons - they should always stay active
			if not npc is DragonNPC:
				npcs_to_deactivate.append(npc)
	
	for npc in npcs_to_deactivate:
		npc.deactivate()
		active_npcs.erase(npc)

func get_active_npc_count() -> int:
	"""Get number of currently active NPCs"""
	return active_npcs.size()

func get_total_npc_count() -> int:
	"""Get total number of NPCs in all chunks"""
	var count = 0
	for chunk_npcs in npcs_by_chunk.values():
		count += chunk_npcs.size()
	return count
