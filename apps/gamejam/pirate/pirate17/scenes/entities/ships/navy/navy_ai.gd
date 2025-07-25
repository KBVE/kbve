class_name NavyAI
extends NPC

const NAVY_DOCK_HEALING_RATE = 3
const NAVY_PATROL_RANGE = 12
const NAVY_DETECTION_RANGE = 8
const NAVY_FORMATION_DISTANCE = 3
const NAVY_ESCORT_DISTANCE = 5

var navy_rank: String = "Patrol"
var formation_leader: NavyAI = null
var formation_members: Array[NavyAI] = []
var escort_target: Node2D = null
var patrol_waypoints: Array[Vector2i] = []
var current_waypoint_index: int = 0
var is_formation_leader: bool = false

enum NavyState {
	DOCK_PATROL,
	FORMATION_PATROL,
	ESCORT_DUTY,
	DEFENSIVE_POSITION,
	EMERGENCY_RETREAT
}

var navy_state: NavyState = NavyState.DOCK_PATROL
var home_dock: Vector2i = Vector2i(-1, -1)
var assigned_dock: Vector2i = Vector2i(-1, -1)
var current_mission: Dictionary = {}

func _ready():
	super._ready()
	
	dock_healing_rate = NAVY_DOCK_HEALING_RATE
	movement_range = NAVY_PATROL_RANGE
	detection_range = NAVY_DETECTION_RANGE
	
	setup_navy_specific_behavior()
	assign_home_dock()
	assign_random_mission()

func setup_navy_specific_behavior():
	attack_cooldown = 3.0
	spear_speed = 320.0
	max_health = 15
	current_health = 15
	max_mana = 15
	current_mana = 15
	
	if scene_health_bar:
		scene_health_bar.max_value = max_health
		scene_health_bar.value = current_health
	if scene_health_label:
		scene_health_label.text = str(current_health) + "/" + str(max_health)
	if scene_mana_bar:
		scene_mana_bar.max_value = max_mana
		scene_mana_bar.value = current_mana
	if scene_mana_label:
		scene_mana_label.text = str(current_mana) + "/" + str(max_mana)

func assign_home_dock():
	var nearest_dock = find_nearest_dock_position()
	if nearest_dock != Vector2i(-1, -1):
		home_dock = nearest_dock
		assigned_dock = nearest_dock
		current_dock_target = nearest_dock
		setup_dock_patrol_route()

func find_nearest_dock_position() -> Vector2i:
	var nearest_dock_pos = Vector2i(-1, -1)
	var nearest_distance = INF
	
	var structures = World.get_all_structures()
	for structure in structures:
		if structure.type == StructurePool.StructureType.PORT:
			var dock_pos = structure.grid_position
			var distance = abs(grid_position.x - dock_pos.x) + abs(grid_position.y - dock_pos.y)
			
			if distance < nearest_distance:
				nearest_distance = distance
				nearest_dock_pos = dock_pos
	
	return nearest_dock_pos

func setup_dock_patrol_route():
	if home_dock == Vector2i(-1, -1):
		return
	
	patrol_waypoints.clear()
	
	var dock_patrol_radius = 6
	var waypoint_positions = [
		Vector2i(home_dock.x - dock_patrol_radius, home_dock.y),
		Vector2i(home_dock.x, home_dock.y - dock_patrol_radius),
		Vector2i(home_dock.x + dock_patrol_radius, home_dock.y),
		Vector2i(home_dock.x, home_dock.y + dock_patrol_radius),
		Vector2i(home_dock.x - dock_patrol_radius/2, home_dock.y - dock_patrol_radius/2),
		Vector2i(home_dock.x + dock_patrol_radius/2, home_dock.y - dock_patrol_radius/2),
		Vector2i(home_dock.x + dock_patrol_radius/2, home_dock.y + dock_patrol_radius/2),
		Vector2i(home_dock.x - dock_patrol_radius/2, home_dock.y + dock_patrol_radius/2)
	]
	
	for waypoint in waypoint_positions:
		if waypoint.x >= 0 and waypoint.x < World.MAP_WIDTH and waypoint.y >= 0 and waypoint.y < World.MAP_HEIGHT:
			var tile_color = Map.get_tile(waypoint.x, waypoint.y)
			if tile_color != Map.tile_colors["ocean"]:
				patrol_waypoints.append(waypoint)
	
	current_waypoint_index = 0

func transition_to_navy_state(new_state: NavyState):
	if navy_state != new_state:
		navy_state = new_state
		update_navy_state_label()
		
		match new_state:
			NavyState.DOCK_PATROL:
				setup_dock_patrol_route()
			NavyState.EMERGENCY_RETREAT:
				current_dock_target = home_dock
				transition_to_state(NPCState.RETREATING)

func update_navy_state_label():
	if state_badge:
		match navy_state:
			NavyState.DOCK_PATROL:
				if current_mission.size() > 0:
					var mission_type = current_mission.get("mission_type", "Patrol")
					state_badge.update_state(mission_type)
				else:
					state_badge.update_state("Navy Patrol")
			NavyState.FORMATION_PATROL:
				if is_formation_leader:
					state_badge.update_state("Formation Lead")
				else:
					state_badge.update_state("In Formation")
			NavyState.ESCORT_DUTY:
				state_badge.update_state("Escort Duty")
			NavyState.DEFENSIVE_POSITION:
				state_badge.update_state("Defending")
			NavyState.EMERGENCY_RETREAT:
				state_badge.update_state("Emergency Retreat!")

func take_damage(damage: int):
	super.take_damage(damage)
	
	var health_percentage = float(current_health) / float(max_health)
	
	if health_percentage <= 0.4 and navy_state != NavyState.EMERGENCY_RETREAT:
		transition_to_navy_state(NavyState.EMERGENCY_RETREAT)
		call_for_navy_reinforcements()

func call_for_navy_reinforcements():
	var all_npcs = World.get_npcs()
	var reinforcement_called = false
	
	for npc in all_npcs:
		if npc and is_instance_valid(npc) and npc != self and npc is NavyAI:
			var navy_npc = npc as NavyAI
			var distance = abs(grid_position.x - navy_npc.grid_position.x) + abs(grid_position.y - navy_npc.grid_position.y)
			
			if distance <= 15 and navy_npc.navy_state == NavyState.DOCK_PATROL:
				navy_npc.respond_to_navy_distress(self)
				reinforcement_called = true
	
	if reinforcement_called:
		print("Navy ship called for reinforcements!")

func respond_to_navy_distress(calling_ship: NavyAI):
	if navy_state == NavyState.DOCK_PATROL:
		transition_to_navy_state(NavyState.DEFENSIVE_POSITION)
		transition_to_state(NPCState.AGGRESSIVE)
		help_target_position = calling_ship.grid_position
		is_responding_to_help = true
		print("Navy ship responding to distress call")

func _on_movement_timer_timeout():
	# Adjust movement speed based on navy state
	match navy_state:
		NavyState.EMERGENCY_RETREAT:
			movement_timer.wait_time = randf_range(0.5, 0.8)  # Much faster when retreating
		NavyState.DEFENSIVE_POSITION:
			movement_timer.wait_time = randf_range(1.0, 1.5)  # Faster when responding to help
		_:
			movement_timer.wait_time = randf_range(2.0, 3.5)  # Normal speed for patrol
	
	handle_navy_specific_behavior()
	
	super._on_movement_timer_timeout()

func handle_navy_specific_behavior():
	match navy_state:
		NavyState.DOCK_PATROL:
			handle_dock_patrol()
		NavyState.FORMATION_PATROL:
			handle_formation_patrol()
		NavyState.ESCORT_DUTY:
			handle_escort_duty()
		NavyState.DEFENSIVE_POSITION:
			handle_defensive_position()
		NavyState.EMERGENCY_RETREAT:
			handle_emergency_retreat()

func handle_dock_patrol():
	execute_current_mission()
	
	if current_state == NPCState.PATROL and patrol_waypoints.size() > 0:
		var distance_to_current_waypoint = abs(grid_position.x - patrol_waypoints[current_waypoint_index].x) + abs(grid_position.y - patrol_waypoints[current_waypoint_index].y)
		
		if distance_to_current_waypoint <= 2:
			current_waypoint_index = (current_waypoint_index + 1) % patrol_waypoints.size()
		
		if randf() > 0.7:
			attempt_move_toward_waypoint()

func attempt_move_toward_waypoint():
	if patrol_waypoints.size() == 0:
		return
	
	var target_waypoint = patrol_waypoints[current_waypoint_index]
	var direction_to_waypoint = Vector2i(
		sign(target_waypoint.x - grid_position.x),
		sign(target_waypoint.y - grid_position.y)
	)
	
	var possible_moves = [direction_to_waypoint]
	if direction_to_waypoint.x != 0 and direction_to_waypoint.y != 0:
		possible_moves.append(Vector2i(direction_to_waypoint.x, 0))
		possible_moves.append(Vector2i(0, direction_to_waypoint.y))
	
	for direction in possible_moves:
		var new_pos = grid_position + direction
		if is_valid_move(new_pos):
			move_to(new_pos)
			return

func handle_formation_patrol():
	if is_formation_leader:
		handle_formation_leader_movement()
	else:
		handle_formation_member_movement()

func handle_formation_leader_movement():
	if formation_members.size() > 0:
		attempt_formation_move()
	else:
		transition_to_navy_state(NavyState.DOCK_PATROL)

func handle_formation_member_movement():
	if formation_leader and is_instance_valid(formation_leader):
		attempt_follow_formation_leader()
	else:
		formation_leader = null
		transition_to_navy_state(NavyState.DOCK_PATROL)

func attempt_follow_formation_leader():
	if not formation_leader:
		return
	
	var leader_pos = formation_leader.grid_position
	var desired_distance = NAVY_FORMATION_DISTANCE
	var distance_to_leader = abs(grid_position.x - leader_pos.x) + abs(grid_position.y - leader_pos.y)
	
	if distance_to_leader > desired_distance + 2:
		var direction_to_leader = Vector2i(
			sign(leader_pos.x - grid_position.x),
			sign(leader_pos.y - grid_position.y)
		)
		
		var possible_moves = [direction_to_leader]
		if direction_to_leader.x != 0:
			possible_moves.append(Vector2i(direction_to_leader.x, 0))
		if direction_to_leader.y != 0:
			possible_moves.append(Vector2i(0, direction_to_leader.y))
		
		for direction in possible_moves:
			var new_pos = grid_position + direction
			if is_valid_move(new_pos):
				move_to(new_pos)
				return

func attempt_formation_move():
	var valid_moves = []
	var all_directions = [
		Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0),
		Vector2i(-1, -1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(1, 1)
	]
	
	for direction in all_directions:
		var new_pos = grid_position + direction
		if is_valid_move(new_pos) and can_formation_follow(new_pos):
			valid_moves.append(new_pos)
	
	if valid_moves.size() > 0:
		var chosen_move = valid_moves[randi() % valid_moves.size()]
		move_to(chosen_move)

func can_formation_follow(leader_new_pos: Vector2i) -> bool:
	for member in formation_members:
		if member and is_instance_valid(member):
			var member_can_follow = false
			var all_directions = [
				Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0),
				Vector2i(-1, -1), Vector2i(1, -1), Vector2i(-1, 1), Vector2i(1, 1)
			]
			
			for direction in all_directions:
				var member_new_pos = member.grid_position + direction
				var distance_to_leader = abs(member_new_pos.x - leader_new_pos.x) + abs(member_new_pos.y - leader_new_pos.y)
				if distance_to_leader <= NAVY_FORMATION_DISTANCE + 1 and member.is_valid_move(member_new_pos):
					member_can_follow = true
					break
			
			if not member_can_follow:
				return false
	return true

func handle_escort_duty():
	if escort_target and is_instance_valid(escort_target):
		attempt_escort_movement()
	else:
		escort_target = null
		transition_to_navy_state(NavyState.DOCK_PATROL)

func attempt_escort_movement():
	var target_pos = Vector2i(int(escort_target.position.x / World.TILE_SIZE), int(escort_target.position.y / World.TILE_SIZE))
	var distance_to_target = abs(grid_position.x - target_pos.x) + abs(grid_position.y - target_pos.y)
	
	if distance_to_target > NAVY_ESCORT_DISTANCE:
		var direction_to_target = Vector2i(
			sign(target_pos.x - grid_position.x),
			sign(target_pos.y - grid_position.y)
		)
		
		var possible_moves = [direction_to_target]
		if direction_to_target.x != 0:
			possible_moves.append(Vector2i(direction_to_target.x, 0))
		if direction_to_target.y != 0:
			possible_moves.append(Vector2i(0, direction_to_target.y))
		
		for direction in possible_moves:
			var new_pos = grid_position + direction
			if is_valid_move(new_pos):
				move_to(new_pos)
				return

func handle_defensive_position():
	if is_responding_to_help and help_target_position != Vector2i(-1, -1):
		attempt_move_to_help_target()
	else:
		transition_to_navy_state(NavyState.DOCK_PATROL)

func handle_emergency_retreat():
	if current_state != NPCState.RETREATING:
		transition_to_state(NPCState.RETREATING)
	
	if current_health >= max_health * 0.8:
		transition_to_navy_state(NavyState.DOCK_PATROL)

func create_navy_formation(members: Array[NavyAI]):
	if members.size() == 0:
		return
	
	is_formation_leader = true
	formation_members = members
	transition_to_navy_state(NavyState.FORMATION_PATROL)
	
	for member in members:
		if member and is_instance_valid(member):
			member.join_formation(self)

func join_formation(leader: NavyAI):
	formation_leader = leader
	is_formation_leader = false
	transition_to_navy_state(NavyState.FORMATION_PATROL)

func assign_escort_duty(target: Node2D):
	escort_target = target
	transition_to_navy_state(NavyState.ESCORT_DUTY)

func return_to_dock():
	current_dock_target = home_dock
	transition_to_state(NPCState.RETREATING)
	transition_to_navy_state(NavyState.EMERGENCY_RETREAT)

func is_valid_move(pos: Vector2i) -> bool:
	var base_valid = super.is_valid_move(pos)
	if not base_valid:
		return false
	
	if navy_state == NavyState.DOCK_PATROL and home_dock != Vector2i(-1, -1):
		var distance_to_home = abs(pos.x - home_dock.x) + abs(pos.y - home_dock.y)
		if distance_to_home > NAVY_PATROL_RANGE:
			return false
	
	return true

func assign_random_mission():
	var mission_types = [
		AdvancedAIBehaviors.MissionType.SUPPLY_RUN,
		AdvancedAIBehaviors.MissionType.RECONNAISSANCE,
		AdvancedAIBehaviors.MissionType.BORDER_PATROL
	]
	
	if randf() > 0.7:
		var chosen_mission = mission_types[randi() % mission_types.size()]
		current_mission = AdvancedAIBehaviors.get_mission_behavior(self, chosen_mission)
		navy_rank = current_mission.get("mission_type", "Patrol")
		print("Navy ship assigned mission: ", navy_rank)

func assign_specific_mission(mission_type: AdvancedAIBehaviors.MissionType):
	current_mission = AdvancedAIBehaviors.get_mission_behavior(self, mission_type)
	navy_rank = current_mission.get("mission_type", "Special Ops")
	print("Navy ship assigned specific mission: ", navy_rank)

func execute_current_mission():
	if current_mission.size() > 0:
		AdvancedAIBehaviors.execute_advanced_behavior(self, current_mission)

func complete_mission():
	print("Navy ship completed mission: ", navy_rank)
	current_mission.clear()
	navy_rank = "Patrol"
	transition_to_navy_state(NavyState.DOCK_PATROL)

func get_mission_status() -> String:
	if current_mission.size() == 0:
		return "No active mission"
	
	var mission_type = current_mission.get("mission_type", "Unknown")
	match mission_type:
		"Supply Run":
			var waypoints = current_mission.get("waypoints", [])
			return "Supply Run: " + str(waypoints.size()) + " waypoints remaining"
		"Reconnaissance":
			var sectors = current_mission.get("patrol_sectors", [])
			return "Reconnaissance: " + str(sectors.size()) + " sectors to patrol"
		"Border Patrol":
			var violations = current_mission.get("border_violations", [])
			return "Border Patrol: " + str(violations.size()) + " violations detected"
		_:
			return mission_type + " in progress"
