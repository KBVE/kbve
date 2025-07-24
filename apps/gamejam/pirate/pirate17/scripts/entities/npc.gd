class_name NPC
extends Node2D

const Movement = preload("res://scripts/world/movement.gd")

var grid_position: Vector2i
var target_position: Vector2i
var move_component: Movement.MoveComponent
var npc_sprite: Sprite2D

# NPC AI properties
var movement_timer: Timer
var movement_interval: float = 2.0  # Move every 2 seconds
var movement_range: int = 8  # How far NPC can move from spawn (increased from 3)
var follow_distance: int = 1  # Stay this far from player when following

var spawn_position: Vector2i
var is_initialized: bool = false

# Health system
var max_health: int = 3
var current_health: int = 3
var health_bar: ProgressBar
var click_area: Area2D

# Enhanced AI State System
enum NPCState {
	PATROL,    # Black - Normal patrol around spawn
	AGGRESSIVE,   # Dark Red - Actively following player
	RETURNING     # Dark Orange - Lost player, returning to spawn
}

var current_state: NPCState = NPCState.PATROL
var detection_range: int = 6     # How close to detect player and become aggressive (reduced from 10)
var chase_threshold: int = 8     # Chase up to this distance when aggressive (reduced from 15)
var restart_distance: int = 10   # Begin restart process at this distance (reduced from 18)
var reset_distance: int = 12     # Give up and reset at this distance (reduced from 22)
var is_following_player: bool = false  # Legacy variable for compatibility

# Performance optimization - late update system
var aggression_check_timer: Timer
var aggression_check_interval: float = 2.0  # Check aggression less frequently (increased from 1.0)

# Combat system
var attack_range: int = 6
var attack_cooldown: float = 4.0
var spear_speed: float = 280.0
var attack_timer: Timer
var is_attacking: bool = false

# Path visualization
var path_visualizer: Node2D
var dash_lines: Array[Line2D] = []

# UI elements
var state_badge: FantasyStateBadge

# Scene-based visual components (will be assigned if using scene)
@onready var visual_container: Node2D = get_node_or_null("VisualContainer")
@onready var ship_sprite: Sprite2D = get_node_or_null("VisualContainer/ShipSprite")
@onready var scene_health_bar: ProgressBar = get_node_or_null("VisualContainer/StatusBars/HealthBar")
@onready var scene_mana_bar: ProgressBar = get_node_or_null("VisualContainer/StatusBars/ManaBar")
@onready var scene_click_area: Area2D = get_node_or_null("ClickArea")

# Mana system for navy ships
var max_mana: int = 3
var current_mana: int = 3

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
	setup_aggression_timer()
	setup_attack_timer()
	connect_movement_signals()
	setup_click_detection()

func setup_click_detection():
	click_area = Area2D.new()
	var collision_shape = CollisionShape2D.new()
	var shape = CircleShape2D.new()
	shape.radius = 20
	collision_shape.shape = shape
	
	click_area.add_child(collision_shape)
	add_child(click_area)
	
	click_area.input_event.connect(_on_click_area_input)

func _on_click_area_input(viewport, event, shape_idx):
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT:
		take_damage(1)

func connect_movement_signals():
	move_component.movement_started.connect(_on_movement_started)
	move_component.movement_finished.connect(_on_movement_finished)

func _on_movement_started(entity: Node2D, from: Vector2i, to: Vector2i):
	if entity == self:
		# Rotate NPC to face movement direction
		update_npc_rotation(from, to)

func _on_movement_finished(entity: Node2D, at: Vector2i):
	if entity == self:
		hide_movement_path()

func update_npc_rotation(from: Vector2i, to: Vector2i):
	"""Update NPC sprite rotation to face movement direction"""
	if not npc_sprite:
		return
		
	var movement_vector = to - from
	if movement_vector == Vector2i.ZERO:
		return
	
	# Calculate angle like the player ship
	var angle = atan2(movement_vector.y, movement_vector.x)
	var target_angle = angle + PI / 2
	
	# Rotate the NPC sprite to face movement direction
	npc_sprite.rotation = target_angle

func create_visual():
	# Check if we have scene-based visual components
	if visual_container and ship_sprite:
		# Use scene-based components
		npc_sprite = ship_sprite
		
		# Add shadow to existing visual container
		var ship_shadow = preload("res://scripts/ship_shadow.gd").new()
		ship_shadow.shadow_offset = Vector2(12, 15)
		ship_shadow.shadow_scale = 0.7
		visual_container.add_child(ship_shadow)
		call_deferred("_adjust_shadow_z_index", ship_shadow)
		
		# Create fantasy state badge
		state_badge = FantasyStateBadge.new()
		state_badge.state_text = "Patrol..."
		state_badge.z_index = 25
		visual_container.add_child(state_badge)
		call_deferred("position_state_badge")
		
		# Don't create health bar - use scene-based one
		return
	
	# Fallback: Create script-based visual components for legacy NPCs
	var script_visual_container = Node2D.new()
	script_visual_container.z_index = 15
	
	# Create main NPC sprite using enemy airship
	npc_sprite = Sprite2D.new()
	npc_sprite.texture = load("res://assets/ship/enemy_airship.png")
	npc_sprite.position = Vector2.ZERO
	npc_sprite.z_index = 1
	
	# Scale it appropriately for the game
	var scale_factor = 0.8  # Slightly smaller than player ship
	npc_sprite.scale = Vector2(scale_factor, scale_factor)
	
	script_visual_container.add_child(npc_sprite)
	
	# Add shadow to NPC ship
	var ship_shadow = preload("res://scripts/ship_shadow.gd").new()
	ship_shadow.shadow_offset = Vector2(12, 15)  # Larger offset for better shadow effect
	ship_shadow.shadow_scale = 0.7  # Larger shadow size for better visual effect
	script_visual_container.add_child(ship_shadow)
	
	# Ensure shadow renders under the NPC sprite by adjusting z_index after creation
	call_deferred("_adjust_shadow_z_index", ship_shadow)
	
	# Create fantasy state badge
	state_badge = FantasyStateBadge.new()
	state_badge.state_text = "Patrol..."
	state_badge.z_index = 25  # Above everything else
	script_visual_container.add_child(state_badge)
	
	# Position badge above NPC after it's sized
	call_deferred("position_state_badge")
	
	# Create health bar
	create_health_bar(script_visual_container)
	
	add_child(script_visual_container)

func create_health_bar(container: Node2D):
	health_bar = ProgressBar.new()
	health_bar.size = Vector2(40, 6)
	health_bar.position = Vector2(-20, -60)
	health_bar.min_value = 0
	health_bar.max_value = max_health
	health_bar.value = current_health
	health_bar.z_index = 30
	
	# Style the health bar
	var style_bg = StyleBoxFlat.new()
	style_bg.bg_color = Color(0.2, 0.2, 0.2, 0.8)
	style_bg.corner_radius_top_left = 2
	style_bg.corner_radius_top_right = 2
	style_bg.corner_radius_bottom_left = 2
	style_bg.corner_radius_bottom_right = 2
	
	var style_fg = StyleBoxFlat.new()
	style_fg.bg_color = Color(0.8, 0.2, 0.2, 1.0)
	style_fg.corner_radius_top_left = 2
	style_fg.corner_radius_top_right = 2
	style_fg.corner_radius_bottom_left = 2
	style_fg.corner_radius_bottom_right = 2
	
	health_bar.add_theme_stylebox_override("background", style_bg)
	health_bar.add_theme_stylebox_override("fill", style_fg)
	
	container.add_child(health_bar)

func take_damage(damage: int):
	print("DEBUG: NPC take_damage called with ", damage, " damage")
	print("DEBUG: Health before: ", current_health, "/", max_health)
	
	current_health -= damage
	current_health = max(0, current_health)
	
	print("DEBUG: Health after: ", current_health, "/", max_health)
	
	# Update health bar (script-created)
	if health_bar:
		health_bar.value = current_health
		
		# Change health bar color based on health percentage
		var health_percent = float(current_health) / float(max_health)
		var style_fg = StyleBoxFlat.new()
		
		if health_percent > 0.6:
			style_fg.bg_color = Color(0.2, 0.8, 0.2, 1.0)  # Green
		elif health_percent > 0.3:
			style_fg.bg_color = Color(0.8, 0.8, 0.2, 1.0)  # Yellow
		else:
			style_fg.bg_color = Color(0.8, 0.2, 0.2, 1.0)  # Red
		
		style_fg.corner_radius_top_left = 2
		style_fg.corner_radius_top_right = 2
		style_fg.corner_radius_bottom_left = 2
		style_fg.corner_radius_bottom_right = 2
		
		health_bar.add_theme_stylebox_override("fill", style_fg)
	
	# Update scene-based health bar
	if scene_health_bar:
		scene_health_bar.value = current_health
		print("DEBUG: Updated scene health bar to ", current_health)
		
		# Update fantasy health bar - it already uses ValueRed_120x8.png, no need to change color
		# The ValueBar_128x16.png background contains the ValueRed_120x8.png fill properly
	
	# Update mana bar if it exists (for scene-based entities)
	if scene_mana_bar:
		scene_mana_bar.value = current_mana
	
	# Check if NPC should die
	if current_health <= 0:
		print("DEBUG: NPC should die now")
		die()

func die():
	print("NPC died!")
	# Create death effect or animation here
	queue_free()

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
				movement_timer.wait_time = randf_range(2.0, 3.5)  # Slower when aggressive (reduced from 1.0-2.0)
			NPCState.RETURNING:
				movement_timer.wait_time = randf_range(1.5, 2.5)  # Slower retreating speed (reduced from 1.0-2.0)
				# Immediately attempt to retreat when entering retreating state
				call_deferred("attempt_retreat_from_player")
			NPCState.PATROL:
				movement_timer.wait_time = randf_range(2.0, 4.0)  # Slower patrol speed (increased from 1.5-3.0)
				# Immediately attempt a move when entering patrol state
				call_deferred("attempt_random_move")
		
		# Restart the timer to ensure it continues
		if movement_timer:
			movement_timer.start()

func _adjust_shadow_z_index(ship_shadow):
	"""Adjust shadow z_index to render under the NPC sprite"""
	if ship_shadow and ship_shadow.shadow_sprite:
		ship_shadow.shadow_sprite.z_index = 0  # Under NPC sprite (which is at z_index 1)

func position_state_badge():
	if state_badge:
		# Center the badge horizontally above the NPC
		var badge_x = -state_badge.size.x / 2
		var badge_y = -45  # Fixed distance above NPC
		state_badge.position = Vector2(badge_x, badge_y)

func update_state_label():
	if state_badge:
		match current_state:
			NPCState.PATROL:
				state_badge.update_state("Patrol...")
			NPCState.AGGRESSIVE:
				state_badge.update_state("Aggressive!")
			NPCState.RETURNING:
				state_badge.update_state("Retreating...")
		
		# Reposition badge after text change
		call_deferred("position_state_badge")

func update_visual_state():
	# Change NPC color based on current state
	if npc_sprite:
		match current_state:
			NPCState.PATROL:
				# Normal color when patrol
				npc_sprite.modulate = Color.WHITE
			NPCState.AGGRESSIVE:
				# Red tint when aggressively following player
				npc_sprite.modulate = Color(1.0, 0.4, 0.4, 1.0)
			NPCState.RETURNING:
				# Yellow/orange tint when returning to spawn after losing player
				npc_sprite.modulate = Color(1.0, 0.8, 0.4, 1.0)

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

func setup_aggression_timer():
	aggression_check_timer = Timer.new()
	aggression_check_timer.wait_time = aggression_check_interval
	aggression_check_timer.timeout.connect(_on_aggression_check_timeout)
	aggression_check_timer.autostart = true
	add_child(aggression_check_timer)

func setup_attack_timer():
	attack_timer = Timer.new()
	attack_timer.wait_time = attack_cooldown
	attack_timer.one_shot = true
	attack_timer.timeout.connect(_on_attack_cooldown_finished)
	add_child(attack_timer)

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
	# Randomize movement interval - slower overall
	movement_timer.wait_time = randf_range(2.5, 4.5)
	
	# Get current player distance
	var player_distance = get_distance_to_player()
	
	# State machine logic
	match current_state:
		NPCState.PATROL:
			# Check if player enters detection range
			if player_distance <= detection_range:
				transition_to_state(NPCState.AGGRESSIVE)
			else:
				# Continue patrol around spawn
				if get_distance_to_spawn() > movement_range * 2:
					# Too far from spawn - move back toward it
					attempt_return_to_spawn()
				else:
					# Within patrol range - move randomly
					attempt_random_move()
		
		NPCState.AGGRESSIVE:
			# Check if we can attack first
			if player_distance <= attack_range and not is_attacking and attack_timer.is_stopped():
				attempt_spear_attack()
			# Once aggressive, stay aggressive until player is too far
			elif player_distance > reset_distance:
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
				# Move away from player, then transition to patrol after some distance
				if player_distance >= detection_range + 3:
					# Far enough from player - resume patrol
					transition_to_state(NPCState.PATROL)
				elif randf() < 0.2:
					# 20% chance to start patrol even if not far enough
					transition_to_state(NPCState.PATROL)
				else:
					# Continue moving away from player
					attempt_retreat_from_player()
	
	# Update visual appearance based on current state
	update_visual_state()

func _on_aggression_check_timeout():
	# Performance optimized - check aggression state changes less frequently
	var player_distance = get_distance_to_player()
	
	match current_state:
		NPCState.PATROL:
			# Check if player enters detection range
			if player_distance <= detection_range:
				transition_to_state(NPCState.AGGRESSIVE)
		NPCState.AGGRESSIVE:
			# Check if player is too far away
			if player_distance > reset_distance:
				transition_to_state(NPCState.RETURNING)
			elif player_distance > restart_distance:
				# Player getting far but not lost yet - continue for now
				pass
		NPCState.RETURNING:
			# Check if player is nearby again while returning
			if player_distance <= detection_range:
				transition_to_state(NPCState.AGGRESSIVE)
			elif get_distance_to_spawn() <= 2:
				# Reached spawn area - resume patrol
				transition_to_state(NPCState.PATROL)

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
		# Allow larger movement range for patrol (up to 8 tiles from spawn)
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

func attempt_spear_attack():
	"""Attempt to fire a spear at the player"""
	var main_scene = get_tree().current_scene
	if not main_scene or not main_scene.has_method("get_player_position"):
		return
	
	var player = main_scene.get_node_or_null("Player")
	if not player:
		return
	
	var npc_world_pos = position
	var player_world_pos = player.position
	var distance = npc_world_pos.distance_to(player_world_pos)
	
	if distance <= attack_range * World.TILE_SIZE:
		perform_spear_attack(player_world_pos, player)

func perform_spear_attack(target_pos: Vector2, target_entity: Node2D):
	"""Perform the actual spear attack"""
	is_attacking = true
	
	# Get spear pool reference
	var spear_pool = get_node_or_null("/root/Main/SpearPool")
	if not spear_pool:
		# Try alternative path
		spear_pool = get_tree().current_scene.get_node_or_null("SpearPool")
	if not spear_pool:
		print("SpearPool not found for NPC attack!")
		is_attacking = false
		return
	
	# Calculate spawn position in front of the ship
	var direction_to_target = (target_pos - position).normalized()
	var spawn_offset = 25.0  # Distance from ship center
	var spear_spawn_pos = position + direction_to_target * spawn_offset
	
	# Launch spear
	var success = spear_pool.launch_spear(
		spear_spawn_pos,
		target_pos,
		spear_speed,
		1,  # NPC spears do 1 damage
		self
	)
	
	if success:
		print("Enemy ship fired spear at player!")
		# Start cooldown
		attack_timer.start()
	else:
		print("No spears available for NPC attack!")
		is_attacking = false

func _on_attack_cooldown_finished():
	"""Called when attack cooldown finishes"""
	is_attacking = false
