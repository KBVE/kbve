class_name ChunkManager
extends RefCounted

# Chunk system for efficient map rendering
const CHUNK_SIZE = 16  # 16x16 tiles per chunk
const VIEW_DISTANCE = 3  # Render chunks within 3 chunks of player
const TILE_SIZE = 32

# Chunk data structure
class Chunk:
	var position: Vector2i  # Chunk position in chunk coordinates
	var tiles: Dictionary = {}  # Local tile positions -> tile data
	var sprites: Dictionary = {}  # Local tile positions -> sprite nodes
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

# Active chunks
var loaded_chunks: Dictionary = {}  # chunk_position -> Chunk
var chunk_container: Node2D  # Parent node for all chunk sprites

# References
var map_ref: Node  # Reference to Map autoload
var world_ref: Node  # Reference to World

# Ocean animation (currently unused, but kept for future enhancements)
var ocean_tiles: Array[Node2D] = []
var ocean_animation_timer: float = 0.0

func _init():
	print("ChunkManager initialized")

func setup(map_node: Node, world_node: Node, container: Node2D):
	"""Initialize chunk manager with required references"""
	map_ref = map_node
	world_ref = world_node
	chunk_container = container

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
	
	# Determine which chunks should be loaded
	var chunks_to_load = []
	for x in range(-VIEW_DISTANCE, VIEW_DISTANCE + 1):
		for y in range(-VIEW_DISTANCE, VIEW_DISTANCE + 1):
			var chunk_pos = player_chunk_pos + Vector2i(x, y)
			# Check if chunk is within map bounds
			var chunk_world_start = chunk_pos * CHUNK_SIZE
			if chunk_world_start.x >= 0 and chunk_world_start.y >= 0 and \
			   chunk_world_start.x < map_ref.map_size.x and chunk_world_start.y < map_ref.map_size.y:
				chunks_to_load.append(chunk_pos)
	
	# Unload chunks that are too far
	var chunks_to_unload = []
	for chunk_pos in loaded_chunks:
		if chunk_pos not in chunks_to_load:
			chunks_to_unload.append(chunk_pos)
	
	for chunk_pos in chunks_to_unload:
		unload_chunk(chunk_pos)
	
	# Load new chunks
	for chunk_pos in chunks_to_load:
		if chunk_pos not in loaded_chunks:
			load_chunk(chunk_pos)

func load_chunk(chunk_pos: Vector2i):
	"""Load a chunk and create its sprites"""
	var chunk = Chunk.new(chunk_pos)
	
	# Generate sprites for all tiles in the chunk
	for x in range(CHUNK_SIZE):
		for y in range(CHUNK_SIZE):
			var local_pos = Vector2i(x, y)
			var world_pos = chunk.get_world_position(local_pos)
			
			# Skip if outside map bounds
			if world_pos.x >= map_ref.map_size.x or world_pos.y >= map_ref.map_size.y:
				continue
			
			# Get tile color from map
			var tile_color = map_ref.get_tile(world_pos.x, world_pos.y)
			if tile_color != "":
				var sprite = create_tile_sprite(world_pos, tile_color)
				if sprite:
					chunk_container.add_child(sprite)
					chunk.sprites[local_pos] = sprite
					chunk.tiles[local_pos] = tile_color
					
					# Track ocean tiles for future animation
					# if tile_color == map_ref.tile_colors["ocean"]:
					# 	ocean_tiles.append(sprite)
	
	chunk.is_loaded = true
	loaded_chunks[chunk_pos] = chunk
	print("Loaded chunk at ", chunk_pos, " with ", chunk.sprites.size(), " tiles")

func unload_chunk(chunk_pos: Vector2i):
	"""Unload a chunk and free its sprites"""
	var chunk = loaded_chunks.get(chunk_pos)
	if not chunk:
		return
	
	# Free all sprites in the chunk
	for sprite in chunk.sprites.values():
		if sprite and is_instance_valid(sprite):
			# Remove from ocean tiles array if it's an ocean tile
			if sprite in ocean_tiles:
				ocean_tiles.erase(sprite)
			sprite.queue_free()
	
	loaded_chunks.erase(chunk_pos)
	print("Unloaded chunk at ", chunk_pos)

func create_tile_sprite(world_pos: Vector2i, color_hex: String) -> Node2D:
	"""Create a sprite for a tile"""
	var tile_position = Vector2(world_pos.x * TILE_SIZE, world_pos.y * TILE_SIZE)
	
	# Create a Node2D container for the tile
	var tile_node = Node2D.new()
	tile_node.position = tile_position
	tile_node.z_index = -1
	
	# Add a colored rectangle as a child
	var rect = ColorRect.new()
	rect.size = Vector2(TILE_SIZE, TILE_SIZE)
	rect.color = Color(color_hex)
	tile_node.add_child(rect)
	
	# Ocean tiles could have special effects in the future
	if color_hex == map_ref.tile_colors["ocean"]:
		# Could add wave effects, animation, etc. here later
		rect.modulate.a = 0.9  # Slight transparency for water
	
	return tile_node

func update_ocean_animation(delta: float):
	"""Update ocean tile animations"""
	ocean_animation_timer += delta
	if ocean_animation_timer > 10.0:
		ocean_animation_timer = 0.0
		# Randomly adjust some ocean tiles for variety
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
