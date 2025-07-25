class_name NPC
extends Node2D

const Movement = preload("res://scripts/world/movement.gd")

# Signals for navy ship communication
signal calling_for_help(caller: NPC, position: Vector2i)
signal help_requested(caller: NPC)

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
var max_health: int = 10
var current_health: int = 10
var max_mana: int = 10
var current_mana: int = 10
var health_bar: ProgressBar
var click_area: Area2D

# Scene-based UI elements (for navy_airship.tscn)
@onready var scene_health_bar: TextureProgressBar = get_node_or_null("VisualContainer/StatusBarsContainer/StatusBars/HealthBarContainer/HealthBar")
@onready var scene_health_label: Label = get_node_or_null("VisualContainer/StatusBarsContainer/StatusBars/HealthBarContainer/HealthLabel")
@onready var scene_mana_bar: TextureProgressBar = get_node_or_null("VisualContainer/StatusBarsContainer/StatusBars/ManaBarContainer/ManaBar")
@onready var scene_mana_label: Label = get_node_or_null("VisualContainer/StatusBarsContainer/StatusBars/ManaBarContainer/ManaLabel")

# Enhanced AI State System
enum NPCState {
	PATROL,    # Black - Normal patrol around spawn
	AGGRESSIVE,   # Dark Red - Actively following player
	RETURNING,    # Dark Orange - Lost player, returning to spawn
	RETREATING,   # Blue - Hurt, seeking dock for healing
	CALLING_HELP  # Yellow - Calling for reinforcements
}

var current_state: NPCState = NPCState.PATROL
var detection_range: int = 6     # How close to detect player and become aggressive (reduced from 10)
var chase_threshold: int = 8     # Chase up to this distance when aggressive (reduced from 15)
var restart_distance: int = 10   # Begin restart process at this distance (reduced from 18)
var reset_distance: int = 12     # Give up and reset at this distance (reduced from 22)
var is_following_player: bool = false  # Legacy variable for compatibility

# Retreat and dock healing system
var retreat_health_threshold: float = 0.3  # Retreat when health drops below 30%
var current_dock_target: Vector2i = Vector2i(-1, -1)  # Target dock position
var dock_healing_rate: int = 2  # HP per second when at dock
var dock_healing_timer: Timer
var is_at_dock: bool = false

# Call for help system
var call_for_help_threshold: float = 0.5  # Call for help when health drops below 50%
var help_call_range: int = 25  # Ships within 25 tiles will respond
var has_called_for_help: bool = false
var help_call_timer: Timer
var is_responding_to_help: bool = false
var help_target_position: Vector2i = Vector2i(-1, -1)

# AStar2D pathfinding for dock navigation
var astar: AStar2D
var current_path: PackedVector2Array = PackedVector2Array()
var path_index: int = 0

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
@onready var scene_click_area: Area2D = get_node_or_null("ClickArea")

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
	setup_astar_pathfinding()
	connect_movement_signals()
	setup_click_detection()
	
	# Initialize health and mana labels if they exist
	if scene_health_label:
		scene_health_label.text = str(current_health) + "/" + str(max_health)
	if scene_mana_label:
		scene_mana_label.text = str(current_mana) + "/" + str(max_mana)

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
	print("DEBUG: NPC name: ", name)
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
	
	# Update health label
	if scene_health_label:
		scene_health_label.text = str(current_health) + "/" + str(max_health)
	
	# Update mana bar if it exists (for scene-based entities)
	if scene_mana_bar:
		scene_mana_bar.value = current_mana
		
	# Update mana label
	if scene_mana_label:
		scene_mana_label.text = str(current_mana) + "/" + str(max_mana)
	
	# Check health status for different actions
	var health_percentage = float(current_health) / float(max_health)
	
	# Check if NPC should call for help (50% health)
	if health_percentage <= call_for_help_threshold and not has_called_for_help and current_state != NPCState.RETREATING:
		print("Navy ship calling for help! Health at ", health_percentage * 100, "%")
		call_for_help()
	
	# Check if NPC should retreat to dock for healing (30% health)
	if health_percentage <= retreat_health_threshold and current_state != NPCState.RETREATING:
		print("NPC health critical (", health_percentage * 100, "%), seeking dock for healing")
		transition_to_state(NPCState.RETREATING)
		find_nearest_dock()
	
	# Check if NPC should die
	if current_health <= 0:
		print("DEBUG: NPC should die now")
		die()

func find_nearest_dock():
	"""Find the nearest port/dock structure for healing"""
	var nearest_dock_pos = Vector2i(-1, -1)
	var nearest_distance = INF
	
	# Get all structures from World
	var structures = World.get_all_structures()
	
	for structure in structures:
		# Only consider port structures for dock healing
		if structure.type == StructurePool.StructureType.PORT:
			var dock_pos = structure.grid_position
			var distance = abs(grid_position.x - dock_pos.x) + abs(grid_position.y - dock_pos.y)
			
			if distance < nearest_distance:
				nearest_distance = distance
				nearest_dock_pos = dock_pos
	
	if nearest_dock_pos != Vector2i(-1, -1):
		current_dock_target = nearest_dock_pos
		# Clear existing path to recalculate for new target
		current_path.clear()
		path_index = 0
		print("Navy ship found dock at ", current_dock_target, " (distance: ", nearest_distance, ")")
	else:
		print("No docks found, ship will retreat to spawn instead")
		current_dock_target = spawn_position
		current_path.clear()
		path_index = 0

func check_dock_proximity():
	"""Check if NPC is at a dock and start healing if so"""
	if current_state != NPCState.RETREATING:
		return
	
	# Check if we're at the target dock
	var distance_to_dock = abs(grid_position.x - current_dock_target.x) + abs(grid_position.y - current_dock_target.y)
	
	if distance_to_dock <= 2:  # Within 2 tiles of dock
		if not is_at_dock:
			is_at_dock = true
			print("Navy ship reached dock, beginning healing")
			start_dock_healing()
	else:
		if is_at_dock:
			is_at_dock = false
			stop_dock_healing()

func start_dock_healing():
	"""Begin healing at dock"""
	if dock_healing_timer:
		dock_healing_timer.queue_free()
	
	dock_healing_timer = Timer.new()
	dock_healing_timer.wait_time = 1.0  # Heal every second
	dock_healing_timer.timeout.connect(_on_dock_healing_tick)
	dock_healing_timer.autostart = true
	add_child(dock_healing_timer)
	
	# Update state badge to show healing
	update_state_label()

func stop_dock_healing():
	"""Stop healing when leaving dock"""
	if dock_healing_timer:
		dock_healing_timer.queue_free()
		dock_healing_timer = null

func _on_dock_healing_tick():
	"""Heal the NPC while at dock"""
	if current_health < max_health:
		var old_health = current_health
		current_health = min(current_health + dock_healing_rate, max_health)
		print("Navy ship healing: ", old_health, " -> ", current_health, "/", max_health)
		
		# Update health display
		if health_bar:
			health_bar.value = current_health
		if scene_health_bar:
			scene_health_bar.value = current_health
		if scene_health_label:
			scene_health_label.text = str(current_health) + "/" + str(max_health)
		
		# Check if fully healed
		if current_health >= max_health:
			print("Navy ship fully healed, returning to patrol")
			transition_to_state(NPCState.PATROL)
			current_dock_target = Vector2i(-1, -1)
			is_at_dock = false
			stop_dock_healing()

func call_for_help():
	"""Call nearby ships for help"""
	has_called_for_help = true
	transition_to_state(NPCState.CALLING_HELP)
	
	# Emit signal to notify other ships
	calling_for_help.emit(self, grid_position)
	
	# Send help request to all nearby ships
	var all_npcs = World.get_npcs()
	for npc in all_npcs:
		if npc and is_instance_valid(npc) and npc != self:
			var distance = abs(grid_position.x - npc.grid_position.x) + abs(grid_position.y - npc.grid_position.y)
			if distance <= help_call_range:
				# Connect to the other ship if not already connected
				if not is_connected("help_requested", npc._on_help_requested):
					help_requested.connect(npc._on_help_requested)
				# Send help request
				help_requested.emit(self)
	
	# Start timer to stop calling for help after a while
	if help_call_timer:
		help_call_timer.queue_free()
	
	help_call_timer = Timer.new()
	help_call_timer.wait_time = 10.0  # Call for help for 10 seconds
	help_call_timer.one_shot = true
	help_call_timer.timeout.connect(_on_help_call_timeout)
	add_child(help_call_timer)
	help_call_timer.start()

func _on_help_call_timeout():
	"""Stop calling for help after timeout"""
	if current_state == NPCState.CALLING_HELP:
		# Return to appropriate state based on health
		var health_percentage = float(current_health) / float(max_health)
		if health_percentage <= retreat_health_threshold:
			transition_to_state(NPCState.RETREATING)
			find_nearest_dock()
		else:
			transition_to_state(NPCState.AGGRESSIVE)

func _on_help_requested(caller: NPC):
	"""Respond to help request from another ship"""
	if current_state == NPCState.PATROL and not is_responding_to_help:
		print(name, " responding to help from ", caller.name)
		is_responding_to_help = true
		help_target_position = caller.grid_position
		transition_to_state(NPCState.AGGRESSIVE)

func die():
	print("NPC died!")
	# Clean up timers
	if dock_healing_timer:
		dock_healing_timer.queue_free()
	if help_call_timer:
		help_call_timer.queue_free()
	# Create death effect or animation here
	queue_free()

func attempt_move_to_dock():
	"""Move toward the target dock using AStar2D pathfinding"""
	if current_dock_target == Vector2i(-1, -1):
		# No dock target, try to find one
		find_nearest_dock()
		return
	
	# Check if we need to calculate a new path
	if current_path.is_empty() or path_index >= current_path.size():
		current_path = find_path_to_dock()
		path_index = 1  # Skip the first point (current position)
		
		if current_path.is_empty():
			print("Navy ship couldn't find path to dock, using fallback movement")
			attempt_move_to_dock_fallback()
			return
	
	# Follow the AStar2D path
	if path_index < current_path.size():
		var next_pos = Vector2i(int(current_path[path_index].x), int(current_path[path_index].y))
		
		# Get player position for validation
		var main_scene = get_tree().current_scene
		var player_pos = Vector2i(32, 32)  # Default center position
		if main_scene and main_scene.has_method("get_player_position"):
			player_pos = main_scene.get_player_position()
		
		# Validate the next move is still valid (use basic validity since we're pathfinding to dock)
		if is_valid_move(next_pos):
			move_to(next_pos)
			path_index += 1
		else:
			# Path is blocked, recalculate on next attempt
			current_path.clear()
			path_index = 0

func attempt_move_to_dock_fallback():
	"""Fallback movement when AStar2D path fails"""
	var direction_to_dock = Vector2i(
		sign(current_dock_target.x - grid_position.x),
		sign(current_dock_target.y - grid_position.y)
	)
	
	# Get player position for retreat validation
	var main_scene = get_tree().current_scene
	var player_pos = Vector2i(32, 32)  # Default center position
	if main_scene and main_scene.has_method("get_player_position"):
		player_pos = main_scene.get_player_position()
	
	var possible_moves = [direction_to_dock]
	if direction_to_dock.x != 0 and direction_to_dock.y != 0:
		possible_moves.append(Vector2i(direction_to_dock.x, 0))
		possible_moves.append(Vector2i(0, direction_to_dock.y))
	
	for direction in possible_moves:
		var new_pos = grid_position + direction
		if is_valid_retreat_move(new_pos, player_pos):
			move_to(new_pos)
			return

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
		if movement_timer:
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
				NPCState.RETREATING:
					movement_timer.wait_time = randf_range(1.0, 1.5)  # Fast movement when seeking dock
					# Immediately attempt to move toward dock
					call_deferred("attempt_move_to_dock")
				NPCState.CALLING_HELP:
					movement_timer.wait_time = randf_range(2.5, 3.5)  # Slower when calling for help
					# Continue engaging but stay defensive
		
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
				if is_responding_to_help:
					state_badge.update_state("Responding!")
				else:
					state_badge.update_state("Aggressive!")
			NPCState.RETURNING:
				state_badge.update_state("Retreating...")
			NPCState.RETREATING:
				if is_at_dock:
					state_badge.update_state("Healing...")
				else:
					state_badge.update_state("Seeking Dock!")
			NPCState.CALLING_HELP:
				state_badge.update_state("Calling for help!")
		
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
			NPCState.RETREATING:
				# Blue tint when retreating to dock for healing
				npc_sprite.modulate = Color(0.4, 0.7, 1.0, 1.0)
			NPCState.CALLING_HELP:
				# Yellow tint when calling for help
				npc_sprite.modulate = Color(1.0, 1.0, 0.4, 1.0)

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

func setup_astar_pathfinding():
	"""Initialize AStar2D for intelligent pathfinding"""
	astar = AStar2D.new()
	
	# Add points to AStar grid for the entire map
	for x in range(World.MAP_WIDTH):
		for y in range(World.MAP_HEIGHT):
			var id = y * World.MAP_WIDTH + x
			astar.add_point(id, Vector2(x, y))
	
	# Connect points to their neighbors (4-directional movement)
	for x in range(World.MAP_WIDTH):
		for y in range(World.MAP_HEIGHT):
			var id = y * World.MAP_WIDTH + x
			
			# Connect to right neighbor
			if x < World.MAP_WIDTH - 1:
				var right_id = y * World.MAP_WIDTH + (x + 1)
				if World.is_valid_position(x + 1, y) and World.is_valid_position(x, y):
					astar.connect_points(id, right_id)
			
			# Connect to bottom neighbor
			if y < World.MAP_HEIGHT - 1:
				var bottom_id = (y + 1) * World.MAP_WIDTH + x
				if World.is_valid_position(x, y + 1) and World.is_valid_position(x, y):
					astar.connect_points(id, bottom_id)

func get_astar_id(pos: Vector2i) -> int:
	"""Convert grid position to AStar point ID"""
	return pos.y * World.MAP_WIDTH + pos.x

func find_path_to_dock() -> PackedVector2Array:
	"""Use AStar2D to find optimal path to nearest dock"""
	if current_dock_target == Vector2i(-1, -1):
		return PackedVector2Array()
	
	var start_id = get_astar_id(grid_position)
	var end_id = get_astar_id(current_dock_target)
	
	if not astar.has_point(start_id) or not astar.has_point(end_id):
		return PackedVector2Array()
	
	var path = astar.get_point_path(start_id, end_id)
	
	# Convert world positions back to grid positions
	var grid_path = PackedVector2Array()
	for point in path:
		grid_path.append(Vector2i(int(point.x), int(point.y)))
	
	return grid_path

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
	
	# Get current enemy distance (player or dragons)
	var player_distance = get_distance_to_player()
	var enemy_distance = get_distance_to_nearest_enemy()
	
	# State machine logic
	match current_state:
		NPCState.PATROL:
			# Check if any enemy enters detection range
			if enemy_distance <= detection_range:
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
			# Check if we can attack any target first
			if enemy_distance <= attack_range and not is_attacking and attack_timer.is_stopped():
				attempt_spear_attack()
			# If responding to help, move toward the caller
			elif is_responding_to_help and help_target_position != Vector2i(-1, -1):
				attempt_move_to_help_target()
			# Once aggressive, stay aggressive until enemies are too far
			elif enemy_distance > reset_distance:
				# All enemies are too far - give up and return to spawn
				transition_to_state(NPCState.RETURNING)
				is_responding_to_help = false
			elif enemy_distance > restart_distance:
				# Enemies getting far - begin restart process but still try to chase
				transition_to_state(NPCState.RETURNING)
			elif player_distance <= chase_threshold:
				# Player is close enough - prioritize following player
				if player_distance > chase_threshold:
					attempt_aggressive_chase()
				else:
					attempt_follow_player()
			else:
				# No player nearby but dragons might be - attempt aggressive movement toward nearest enemy
				attempt_aggressive_chase()
		
		NPCState.RETURNING:
			# Check if any enemy is nearby again while returning - re-aggro if so
			if enemy_distance <= detection_range:
				transition_to_state(NPCState.AGGRESSIVE)
			else:
				# Move away from enemies, then transition to patrol after some distance
				if enemy_distance >= detection_range + 3:
					# Far enough from all enemies - resume patrol
					transition_to_state(NPCState.PATROL)
				elif randf() < 0.2:
					# 20% chance to start patrol even if not far enough
					transition_to_state(NPCState.PATROL)
				else:
					# Continue moving away from enemies (primarily player)
					attempt_retreat_from_player()
		
		NPCState.RETREATING:
			# Move toward dock for healing
			attempt_move_to_dock()
			check_dock_proximity()
		
		NPCState.CALLING_HELP:
			# Continue fighting defensively while calling for help
			if enemy_distance <= attack_range and not is_attacking and attack_timer.is_stopped():
				attempt_spear_attack()
			elif enemy_distance > detection_range:
				# Enemy left, stop calling for help
				has_called_for_help = false
				transition_to_state(NPCState.PATROL)
	
	# Update visual appearance based on current state
	update_visual_state()

func _on_aggression_check_timeout():
	# Performance optimized - check aggression state changes less frequently
	var player_distance = get_distance_to_player()
	var enemy_distance = get_distance_to_nearest_enemy()
	
	match current_state:
		NPCState.PATROL:
			# Check if any enemy enters detection range
			if enemy_distance <= detection_range:
				transition_to_state(NPCState.AGGRESSIVE)
		NPCState.AGGRESSIVE:
			# Check if all enemies are too far away
			if enemy_distance > reset_distance:
				transition_to_state(NPCState.RETURNING)
			elif enemy_distance > restart_distance:
				# Enemies getting far but not lost yet - continue for now
				pass
		NPCState.CALLING_HELP:
			# Timeout for calling help - transition back to aggressive after some time
			if enemy_distance > detection_range + 2:
				# Enemy left the area, stop calling for help
				has_called_for_help = false
				transition_to_state(NPCState.PATROL)
			elif enemy_distance > reset_distance:
				# Enemies too far, give up calling for help
				has_called_for_help = false
				transition_to_state(NPCState.RETURNING)
			# Continue calling for help and fighting defensively
		NPCState.RETURNING:
			# Check if any enemy is nearby again while returning
			if enemy_distance <= detection_range:
				transition_to_state(NPCState.AGGRESSIVE)
			elif get_distance_to_spawn() <= 2:
				# Reached spawn area - resume patrol
				transition_to_state(NPCState.PATROL)
		
		NPCState.RETREATING:
			# Continue retreating to dock unless fully healed
			if current_health >= max_health:
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

func get_distance_to_nearest_enemy() -> int:
	"""Get distance to nearest enemy (player or dragons)"""
	var nearest_distance = INF
	
	# Check distance to player
	var player_distance = get_distance_to_player()
	if player_distance < nearest_distance:
		nearest_distance = player_distance
	
	# Check distance to dragons
	var dragons = World.get_dragons()
	for dragon in dragons:
		if dragon and is_instance_valid(dragon):
			var dragon_distance = abs(grid_position.x - dragon.grid_position.x) + abs(grid_position.y - dragon.grid_position.y)
			if dragon_distance < nearest_distance:
				nearest_distance = dragon_distance
	
	return int(nearest_distance)

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

func attempt_move_to_help_target():
	"""Move toward the ship calling for help"""
	if help_target_position == Vector2i(-1, -1):
		is_responding_to_help = false
		return
	
	# Calculate direction to help target
	var direction_to_help = Vector2i(
		sign(help_target_position.x - grid_position.x),
		sign(help_target_position.y - grid_position.y)
	)
	
	# Try different movement options to get closer to help target
	var possible_moves = [direction_to_help]
	
	# Add adjacent directions for more natural movement
	if direction_to_help.x != 0:
		possible_moves.append(Vector2i(direction_to_help.x, 0))
	if direction_to_help.y != 0:
		possible_moves.append(Vector2i(0, direction_to_help.y))
	
	# Try diagonal movements as well
	if direction_to_help.x != 0 and direction_to_help.y != 0:
		possible_moves.append(Vector2i(direction_to_help.x, 0))
		possible_moves.append(Vector2i(0, direction_to_help.y))
	
	# Try to move toward help target
	for direction in possible_moves:
		var new_pos = grid_position + direction
		if is_valid_move(new_pos):
			move_to(new_pos)
			# Check if we've reached the help target area
			var distance_to_target = abs(new_pos.x - help_target_position.x) + abs(new_pos.y - help_target_position.y)
			if distance_to_target <= 3:  # Close enough to help
				is_responding_to_help = false
				help_target_position = Vector2i(-1, -1)
			return

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

func find_npc_attack_target() -> Node2D:
	"""Find the nearest target for NPC attacks (player or dragons)"""
	var nearest_target: Node2D = null
	var nearest_distance: float = INF
	var npc_world_pos = position
	var max_attack_distance = attack_range * World.TILE_SIZE
	
	# Check for dragons as targets
	var dragons = World.get_dragons()
	for dragon in dragons:
		if dragon and is_instance_valid(dragon) and dragon != self:
			var distance = npc_world_pos.distance_to(dragon.position)
			if distance <= max_attack_distance and distance < nearest_distance:
				nearest_target = dragon
				nearest_distance = distance
	
	# Check for player target (prioritize player over dragons)
	var main_scene = get_tree().current_scene
	if main_scene:
		var player = main_scene.get_node_or_null("Player")
		if player:
			var distance = npc_world_pos.distance_to(player.position)
			if distance <= max_attack_distance and distance < nearest_distance:
				nearest_target = player
				nearest_distance = distance
		else:
			# Try alternative player path
			var player_alt = main_scene.get_node_or_null("@Node2D@*/Player")
			if player_alt:
				var distance = npc_world_pos.distance_to(player_alt.position)
				if distance <= max_attack_distance and distance < nearest_distance:
					nearest_target = player_alt
					nearest_distance = distance
	
	return nearest_target

func attempt_spear_attack():
	"""Attempt to fire a spear at the nearest target (player or dragons)"""
	var target = find_npc_attack_target()
	if target:
		perform_spear_attack(target.position, target)

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
