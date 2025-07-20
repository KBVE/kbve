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

var spawn_position: Vector2i

func _ready():
	# Create movement component
	move_component = Movement.MoveComponent.new(self, Vector2i(0, 0))
	
	# Create visual representation (black square)
	create_visual()
	
	# Set up movement timer
	setup_movement_timer()
	
	# Initialize position
	grid_position = Vector2i(0, 0)
	spawn_position = grid_position
	target_position = grid_position

func create_visual():
	npc_sprite = ColorRect.new()
	npc_sprite.color = Color.BLACK
	npc_sprite.size = Vector2(World.TILE_SIZE * 0.8, World.TILE_SIZE * 0.8)
	npc_sprite.position = Vector2(-npc_sprite.size.x / 2, -npc_sprite.size.y / 2)
	add_child(npc_sprite)

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

func _on_movement_timer_timeout():
	# Randomize movement interval
	movement_timer.wait_time = randf_range(1.5, 3.0)
	
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
	
	# Check if within movement range of spawn
	var distance = abs(pos.x - spawn_position.x) + abs(pos.y - spawn_position.y)
	if distance > movement_range:
		return false
	
	# Check if player is at this position
	if pos == Global.player.grid_position:
		return false
	
	return true

func move_to(new_pos: Vector2i):
	target_position = new_pos
	grid_position = new_pos
	
	# Use move component for smooth movement
	move_component.move_to(new_pos, false)

func _process(delta):
	if move_component:
		move_component.process_movement(delta)
