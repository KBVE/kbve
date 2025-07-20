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
var detection_range: int = 4  # How close to detect player
var follow_distance: int = 1  # Stay this far from player when following

var spawn_position: Vector2i
var is_following_player: bool = false

# Path visualization
var path_visualizer: Node2D
var dash_lines: Array[Line2D] = []

func _ready():
	# Initialize position first
	grid_position = Vector2i(0, 0)
	spawn_position = grid_position
	target_position = grid_position
	
	# Create movement component
	move_component = Movement.MoveComponent.new(self, grid_position)
	
	# Create visual representation (black square)
	create_visual()
	
	# Create path visualizer
	create_path_visualizer()
	
	# Set up movement timer
	setup_movement_timer()
	
	# Connect movement signals
	connect_movement_signals()

func connect_movement_signals():
	move_component.movement_finished.connect(_on_movement_finished)

func _on_movement_finished(entity: Node2D, at: Vector2i):
	if entity == self:
		hide_movement_path()

func create_visual():
	npc_sprite = ColorRect.new()
	npc_sprite.color = Color.BLACK
	npc_sprite.size = Vector2(World.TILE_SIZE * 0.8, World.TILE_SIZE * 0.8)
	npc_sprite.position = Vector2(-npc_sprite.size.x / 2, -npc_sprite.size.y / 2)
	add_child(npc_sprite)
	print("NPC visual created - size: ", npc_sprite.size, " color: ", npc_sprite.color)

func setup_movement_timer():
	movement_timer = Timer.new()
	movement_timer.wait_time = movement_interval
	movement_timer.timeout.connect(_on_movement_timer_timeout)
	movement_timer.autostart = true
	add_child(movement_timer)

func initialize(start_pos: Vector2i):
	grid_position = start_pos
	spawn_position = start_pos
	target_position = start_pos
	position = Vector2(grid_position.x * World.TILE_SIZE, grid_position.y * World.TILE_SIZE)
	
	# Update movement component with correct position
	if move_component:
		move_component.current_grid_pos = start_pos
		move_component.target_grid_pos = start_pos
		move_component.target_world_pos = Movement.get_world_position(start_pos)
		position = move_component.target_world_pos
	
	print("NPC initialized at grid: ", grid_position, " world: ", position)

func update_position_after_scene_ready():
	# Called after NPC is added to scene tree to ensure position is correct
	if move_component:
		position = move_component.target_world_pos
		print("Updated NPC position after scene ready: ", position)

func _on_movement_timer_timeout():
	# Randomize movement interval
	movement_timer.wait_time = randf_range(1.5, 3.0)
	
	# Check if player is nearby
	var player_distance = get_distance_to_player()
	
	if player_distance <= detection_range:
		# Follow player behavior
		is_following_player = true
		attempt_follow_player()
	else:
		# Random movement behavior
		is_following_player = false
		# Decide whether to move (70% chance)
		if randf() < 0.7:
			attempt_random_move()

func attempt_random_move():
	# Generate random direction
	var directions = [
		Vector2i(0, -1),  # Up
		Vector2i(0, 1),   # Down
		Vector2i(-1, 0),  # Left
		Vector2i(1, 0)    # Right
	]
	
	directions.shuffle()
	
	for direction in directions:
		var new_pos = grid_position + direction
		
		# Check if move is valid
		if is_valid_move(new_pos):
			move_to(new_pos)
			break

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
		if distance > movement_range:
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
