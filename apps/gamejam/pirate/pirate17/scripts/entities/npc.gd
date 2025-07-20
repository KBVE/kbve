class_name NPC
extends Node2D

const Movement = preload("res://scripts/world/movement.gd")

var grid_position: Vector2i
var target_position: Vector2i
var move_component: Movement.MoveComponent
var npc_sprite: ColorRect

# NPC AI properties
var movement_timer: Timer
var movement_interval: float = 2.0  # Move every 2 seconds
var movement_range: int = 3  # How far NPC can move from spawn
var follow_distance: int = 1  # Stay this far from player when following

var spawn_position: Vector2i
var is_initialized: bool = false

# Enhanced AI State System
enum NPCState {
	WANDERING,    # Black - Normal wandering around spawn
	AGGRESSIVE,   # Dark Red - Actively following player
	RETURNING     # Dark Orange - Lost player, returning to spawn
}

var current_state: NPCState = NPCState.WANDERING
var detection_range: int = 4     # How close to detect player and become aggressive
var chase_threshold: int = 7     # Chase up to this distance when aggressive
var restart_distance: int = 8    # Begin restart process at this distance
var reset_distance: int = 10     # Give up and reset at this distance
var is_following_player: bool = false  # Legacy variable for compatibility

# Path visualization
var path_visualizer: Node2D
var dash_lines: Array[Line2D] = []

# UI elements
var state_label: Label

func _ready():
	# Set z-index to render above map tiles
	z_index = 10
	
	# Only initialize default position if not already initialized
	if not is_initialized:
		grid_position = Vector2i(0, 0)
		spawn_position = grid_position
		target_position = grid_position
		
		# Create movement component
		move_component = Movement.MoveComponent.new(self, grid_position)
	
	# Always create visual and setup components
	create_visual()
	create_path_visualizer()
	setup_movement_timer()
	connect_movement_signals()

func connect_movement_signals():
	move_component.movement_finished.connect(_on_movement_finished)

func _on_movement_finished(entity: Node2D, at: Vector2i):
	if entity == self:
		hide_movement_path()

func create_visual():
	# Create a container for better visibility
	var visual_container = Node2D.new()
	visual_container.z_index = 15
	
	# Create main NPC sprite (black square)
	npc_sprite = ColorRect.new()
	npc_sprite.color = Color.BLACK
	npc_sprite.size = Vector2(World.TILE_SIZE * 0.8, World.TILE_SIZE * 0.8)
	npc_sprite.position = Vector2(-npc_sprite.size.x / 2, -npc_sprite.size.y / 2)
	
	# Create a white border for better visibility
	var border = ColorRect.new()
	border.color = Color.WHITE
	border.size = Vector2(World.TILE_SIZE * 0.9, World.TILE_SIZE * 0.9)
	border.position = Vector2(-border.size.x / 2, -border.size.y / 2)
	border.z_index = -1  # Behind the black square
	
	visual_container.add_child(border)
	visual_container.add_child(npc_sprite)
	
	# Create state label
	state_label = Label.new()
	state_label.text = "Wandering..."
	state_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	state_label.position = Vector2(-30, -40)  # Position above the NPC
	state_label.size = Vector2(60, 20)
	state_label.add_theme_color_override("font_color", Color.WHITE)
	state_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	state_label.add_theme_constant_override("shadow_offset_x", 1)
	state_label.add_theme_constant_override("shadow_offset_y", 1)
	visual_container.add_child(state_label)
	
	add_child(visual_container)

func transition_to_state(new_state: NPCState):
	if current_state != new_state:
		current_state = new_state
		
		# Update legacy following variable for compatibility
		is_following_player = (current_state == NPCState.AGGRESSIVE)
		
		# Update state label
		update_state_label()
		
		# Reset movement timer to ensure it continues working
		if movement_timer:
			movement_timer.stop()
			
		# Adjust movement speed based on state
		match current_state:
			NPCState.AGGRESSIVE:
				movement_timer.wait_time = randf_range(1.0, 2.0)  # Faster when aggressive
			NPCState.RETURNING:
				movement_timer.wait_time = randf_range(1.0, 2.0)  # Fast retreating speed
				# Immediately attempt to retreat when entering retreating state
				call_deferred("attempt_retreat_from_player")
			NPCState.WANDERING:
				movement_timer.wait_time = randf_range(1.5, 3.0)  # Normal wandering speed
				# Immediately attempt a move when entering wandering state
				call_deferred("attempt_random_move")
		
		# Restart the timer to ensure it continues
		if movement_timer:
			movement_timer.start()

func update_state_label():
	if state_label:
		match current_state:
			NPCState.WANDERING:
				state_label.text = "Wandering..."
			NPCState.AGGRESSIVE:
				state_label.text = "Aggressive!"
			NPCState.RETURNING:
				state_label.text = "Retreating..."

func update_visual_state():
	# Change NPC color based on current state
	if npc_sprite:
		match current_state:
			NPCState.WANDERING:
				# Black when wandering normally
				npc_sprite.color = Color.BLACK
			NPCState.AGGRESSIVE:
				# Dark red when aggressively following player
				npc_sprite.color = Color(0.6, 0.1, 0.1, 1.0)
			NPCState.RETURNING:
				# Dark yellow/orange when returning to spawn after losing player
				npc_sprite.color = Color(0.7, 0.5, 0.1, 1.0)

func attempt_aggressive_chase():
	# More aggressive movement when player is far but still trackable
	var main_scene = get_tree().current_scene
	if not main_scene or not main_scene.has_method("get_player_position"):
		return
	
	var player_pos = main_scene.get_player_position()
	
	# Move directly towards player (ignore normal follow distance)
	var direction_to_player = Vector2i(
		sign(player_pos.x - grid_position.x),
		sign(player_pos.y - grid_position.y)
	)
	
	# Try to move towards player with some randomness for pathfinding
	var possible_moves = [direction_to_player]
	
	# Add diagonal and adjacent moves for better pathfinding
	if direction_to_player.x != 0 and direction_to_player.y != 0:
		possible_moves.append(Vector2i(direction_to_player.x, 0))
		possible_moves.append(Vector2i(0, direction_to_player.y))
	
	# Add some random adjacent directions for dynamic movement
	var all_directions = [
		Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0),
		Vector2i(-1, -1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(1, 1)
	]
	all_directions.shuffle()
	possible_moves.append_array(all_directions.slice(0, 2))
	
	# Try each move until we find a valid one
	for direction in possible_moves:
		var new_pos = grid_position + direction
		if is_valid_aggressive_move(new_pos):
			move_to(new_pos)
			break

func is_valid_aggressive_move(pos: Vector2i) -> bool:
	# Check bounds
	if pos.x < 0 or pos.x >= World.MAP_WIDTH or pos.y < 0 or pos.y >= World.MAP_HEIGHT:
		return false
	
	# Check if tile is passable
	var tile_color = Map.get_tile(pos.x, pos.y)
	if tile_color == Map.tile_colors["ocean"]:
		return false
	
	# Check if player is at this position
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("get_player_position"):
		var player_pos = main_scene.get_player_position()
		if pos == player_pos:
			return false
	
	# In aggressive mode, ignore spawn range restrictions
	return true

func setup_movement_timer():
	movement_timer = Timer.new()
	movement_timer.wait_time = movement_interval
	movement_timer.timeout.connect(_on_movement_timer_timeout)
	movement_timer.autostart = true
	add_child(movement_timer)

func initialize(start_pos: Vector2i):
	is_initialized = true
	grid_position = start_pos
	spawn_position = start_pos
	target_position = start_pos
	
	# Create or update movement component with correct position
	if not move_component:
		move_component = Movement.MoveComponent.new(self, start_pos)
	else:
		move_component.current_grid_pos = start_pos
		move_component.target_grid_pos = start_pos
		move_component.target_world_pos = Movement.get_world_position(start_pos)
	
	# Set the actual world position
	position = Movement.get_world_position(start_pos)

func update_position_after_scene_ready():
	# Called after NPC is added to scene tree to ensure position is correct
	if is_initialized:
		# Re-apply the correct position using Movement utility
		position = Movement.get_world_position(grid_position)
		
		# Also update movement component to match
		if move_component:
			move_component.current_grid_pos = grid_position
			move_component.target_grid_pos = grid_position
			move_component.target_world_pos = Movement.get_world_position(grid_position)

func _on_movement_timer_timeout():
	# Randomize movement interval
	movement_timer.wait_time = randf_range(1.5, 3.0)
	
	# Get current player distance
	var player_distance = get_distance_to_player()
	
	# State machine logic
	match current_state:
		NPCState.WANDERING:
			# Check if player enters detection range
			if player_distance <= detection_range:
				transition_to_state(NPCState.AGGRESSIVE)
			else:
				# Continue wandering around spawn
				if get_distance_to_spawn() > movement_range * 2:
					# Too far from spawn - move back toward it
					attempt_return_to_spawn()
				else:
					# Within wandering range - move randomly
					attempt_random_move()
		
		NPCState.AGGRESSIVE:
			# Once aggressive, stay aggressive until player is too far
			if player_distance > reset_distance:
				# Player is too far - give up and return to spawn
				transition_to_state(NPCState.RETURNING)
			elif player_distance > restart_distance:
				# Player is getting far - begin restart process but still try to chase
				transition_to_state(NPCState.RETURNING)
			elif player_distance > chase_threshold:
				# Player is getting far but still within chase range - move towards them aggressively
				attempt_aggressive_chase()
			else:
				# Player is close - follow normally
				attempt_follow_player()
		
		NPCState.RETURNING:
			# Check if player is nearby again while returning - re-aggro if so
			if player_distance <= detection_range:
				transition_to_state(NPCState.AGGRESSIVE)
			else:
				# Move away from player, then transition to wandering after some distance
				if player_distance >= detection_range + 3:
					# Far enough from player - resume wandering
					transition_to_state(NPCState.WANDERING)
				elif randf() < 0.2:
					# 20% chance to start wandering even if not far enough
					transition_to_state(NPCState.WANDERING)
				else:
					# Continue moving away from player
					attempt_retreat_from_player()
	
	# Update visual appearance based on current state
	update_visual_state()

func attempt_random_move():
	# Generate random direction with 1-5 tile movement
	var directions = [
		Vector2i(0, -1),  # Up
		Vector2i(0, 1),   # Down
		Vector2i(-1, 0),  # Left
		Vector2i(1, 0)    # Right
	]
	
	directions.shuffle()
	
	# Try different movement distances (1-5 tiles)
	var movement_distances = [1, 2, 3, 4, 5]
	movement_distances.shuffle()
	
	for direction in directions:
		for distance in movement_distances:
			var new_pos = grid_position + (direction * distance)
			
			# Check if move is valid and path is clear
			if is_valid_move(new_pos) and is_path_clear(grid_position, new_pos):
				move_to(new_pos)
				return
	
	# If no multi-tile move worked, try single tile moves
	for direction in directions:
		var new_pos = grid_position + direction
		if is_valid_move(new_pos):
			move_to(new_pos)
			return

func is_path_clear(from: Vector2i, to: Vector2i) -> bool:
	# Check if all tiles in the path are passable
	var steps = max(abs(to.x - from.x), abs(to.y - from.y))
	if steps <= 1:
		return true  # Single step moves are always "clear"
	
	# Check intermediate tiles in the path
	for i in range(1, steps):
		var progress = float(i) / float(steps)
		var check_pos = Vector2i(
			round(lerp(from.x, to.x, progress)),
			round(lerp(from.y, to.y, progress))
		)
		
		# Check if this intermediate position is passable
		if check_pos.x < 0 or check_pos.x >= World.MAP_WIDTH or check_pos.y < 0 or check_pos.y >= World.MAP_HEIGHT:
			return false
		
		var tile_color = Map.get_tile(check_pos.x, check_pos.y)
		if tile_color == Map.tile_colors["ocean"]:
			return false
	
	return true

func is_valid_move(pos: Vector2i) -> bool:
	# Check bounds
	if pos.x < 0 or pos.x >= World.MAP_WIDTH or pos.y < 0 or pos.y >= World.MAP_HEIGHT:
		return false
	
	# Check if tile is passable
	var tile_color = Map.get_tile(pos.x, pos.y)
	if tile_color == Map.tile_colors["ocean"]:
		return false
	
	# Check if within movement range of spawn (only when not following player)
	if not is_following_player:
		var distance = abs(pos.x - spawn_position.x) + abs(pos.y - spawn_position.y)
		# Allow larger movement range for wandering (up to 8 tiles from spawn)
		if distance > movement_range * 2:
			return false
	
	# Check if player is at this position and validate player access
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("get_player_position"):
		var player_pos = main_scene.get_player_position()
		if pos == player_pos:
			return false
		
		# When following, don't get too close to player (unless we're already at follow distance)
		if is_following_player:
			var distance_to_player = abs(pos.x - player_pos.x) + abs(pos.y - player_pos.y)
			if distance_to_player < follow_distance:
				return false
	
	return true

func is_valid_retreat_move(pos: Vector2i, player_pos: Vector2i) -> bool:
	# Check basic validity first
	if pos.x < 0 or pos.x >= World.MAP_WIDTH or pos.y < 0 or pos.y >= World.MAP_HEIGHT:
		return false
	
	# Check if tile is passable
	var tile_color = Map.get_tile(pos.x, pos.y)
	if tile_color == Map.tile_colors["ocean"]:
		return false
	
	# Check if player is at this position
	if pos == player_pos:
		return false
	
	# Prefer moves that increase distance from player
	var current_distance = abs(grid_position.x - player_pos.x) + abs(grid_position.y - player_pos.y)
	var new_distance = abs(pos.x - player_pos.x) + abs(pos.y - player_pos.y)
	
	# Allow the move if it maintains or increases distance from player
	return new_distance >= current_distance

func move_to(new_pos: Vector2i):
	target_position = new_pos
	
	# Show movement path
	show_movement_path(grid_position, new_pos)
	
	grid_position = new_pos
	
	# Use move component for smooth movement
	move_component.move_to(new_pos, false)

func create_path_visualizer():
	path_visualizer = Node2D.new()
	path_visualizer.name = "PathVisualizer"
	add_child(path_visualizer)

func get_distance_to_player() -> int:
	# Get player position from the main scene's player movement component
	var main_scene = get_tree().current_scene
	if not main_scene or not main_scene.has_method("get_player_position"):
		return 999
	var player_pos = main_scene.get_player_position()
	return abs(grid_position.x - player_pos.x) + abs(grid_position.y - player_pos.y)

func get_distance_to_spawn() -> int:
	# Calculate distance from current position to spawn point
	return abs(grid_position.x - spawn_position.x) + abs(grid_position.y - spawn_position.y)

func attempt_retreat_from_player():
	# Move away from player position
	var main_scene = get_tree().current_scene
	if not main_scene or not main_scene.has_method("get_player_position"):
		return
	
	var player_pos = main_scene.get_player_position()
	
	# Calculate direction away from player
	var direction_away_from_player = Vector2i(
		sign(grid_position.x - player_pos.x),
		sign(grid_position.y - player_pos.y)
	)
	
	# If we're at the same position, pick a random direction
	if direction_away_from_player == Vector2i.ZERO:
		var retreat_directions = [
			Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)
		]
		direction_away_from_player = retreat_directions[randi() % retreat_directions.size()]
	
	# Try to move away, with some randomness for natural movement
	var possible_moves = [direction_away_from_player]
	
	# Add adjacent directions for more natural movement
	if direction_away_from_player.x != 0:
		possible_moves.append(Vector2i(direction_away_from_player.x, 0))
	if direction_away_from_player.y != 0:
		possible_moves.append(Vector2i(0, direction_away_from_player.y))
	
	# Add some diagonal options
	possible_moves.append(Vector2i(-1, -1))
	possible_moves.append(Vector2i(1, -1))
	possible_moves.append(Vector2i(-1, 1))
	possible_moves.append(Vector2i(1, 1))
	
	possible_moves.shuffle()
	
	for direction in possible_moves:
		var new_pos = grid_position + direction
		if is_valid_retreat_move(new_pos, player_pos):
			move_to(new_pos)
			return

func attempt_return_to_spawn():
	# Move towards spawn position
	var direction_to_spawn = Vector2i(
		sign(spawn_position.x - grid_position.x),
		sign(spawn_position.y - grid_position.y)
	)
	
	# Try to move towards spawn, with some randomness
	var possible_moves = [direction_to_spawn]
	
	# Add adjacent directions for more natural movement
	if direction_to_spawn.x != 0:
		possible_moves.append(Vector2i(direction_to_spawn.x, 0))
	if direction_to_spawn.y != 0:
		possible_moves.append(Vector2i(0, direction_to_spawn.y))
	
	possible_moves.shuffle()
	
	for direction in possible_moves:
		var new_pos = grid_position + direction
		if is_valid_move(new_pos):
			move_to(new_pos)
			return

func attempt_follow_player():
	var main_scene = get_tree().current_scene
	if not main_scene or not main_scene.has_method("get_player_position"):
		return
	
	var player_pos = main_scene.get_player_position()
	var desired_positions = get_positions_around_player(player_pos, follow_distance)
	
	# Find the closest valid position
	var best_pos = grid_position
	var best_distance = 999
	
	for pos in desired_positions:
		if is_valid_move(pos):
			var distance = abs(grid_position.x - pos.x) + abs(grid_position.y - pos.y)
			if distance < best_distance:
				best_distance = distance
				best_pos = pos
	
	# Only move if we found a better position
	if best_pos != grid_position:
		move_to(best_pos)

func get_positions_around_player(player_pos: Vector2i, distance: int) -> Array[Vector2i]:
	var positions: Array[Vector2i] = []
	
	# Generate positions in a ring around the player
	for x_offset in range(-distance, distance + 1):
		for y_offset in range(-distance, distance + 1):
			var manhattan_dist = abs(x_offset) + abs(y_offset)
			if manhattan_dist == distance:  # Exactly at follow_distance
				positions.append(Vector2i(player_pos.x + x_offset, player_pos.y + y_offset))
	
	return positions

func show_movement_path(from: Vector2i, to: Vector2i):
	var start_pos = Vector2(from.x * World.TILE_SIZE, from.y * World.TILE_SIZE)
	var end_pos = Vector2(to.x * World.TILE_SIZE, to.y * World.TILE_SIZE)
	
	# Clear existing dash lines
	clear_dash_lines()
	
	# Create dotted line path
	create_dotted_line(start_pos, end_pos)

func create_dotted_line(start: Vector2, end: Vector2):
	var direction = (end - start).normalized()
	var distance = start.distance_to(end)
	var dash_length = 8.0
	var gap_length = 10.0
	var current_distance = 0.0
	
	# Create separate Line2D nodes for each dash
	while current_distance < distance:
		var dash_start = start + direction * current_distance
		var dash_end_distance = min(current_distance + dash_length, distance)
		var dash_end = start + direction * dash_end_distance
		
		# Create a new Line2D for this dash
		var dash_line = Line2D.new()
		dash_line.width = 2.0
		# Different color for NPCs - darker blue
		dash_line.default_color = Color(0.2, 0.4, 0.8, 0.7)
		dash_line.add_point(dash_start - position)  # Relative to NPC position
		dash_line.add_point(dash_end - position)
		
		path_visualizer.add_child(dash_line)
		dash_lines.append(dash_line)
		
		# Move to start of next dash
		current_distance += dash_length + gap_length

func clear_dash_lines():
	for dash_line in dash_lines:
		if dash_line and is_instance_valid(dash_line):
			dash_line.queue_free()
	dash_lines.clear()

func hide_movement_path():
	clear_dash_lines()

func _process(delta):
	if move_component:
		move_component.process_movement(delta)
	
	# Update movement path if moving
	if move_component.is_currently_moving():
		update_movement_path()

func update_movement_path():
	if move_component.is_currently_moving():
		var current_pos = position
		var target_world_pos = Vector2(target_position.x * World.TILE_SIZE, target_position.y * World.TILE_SIZE)
		
		# Update path line to show current position to target
		clear_dash_lines()
		create_dotted_line(current_pos, target_world_pos)
