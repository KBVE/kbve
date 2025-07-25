class_name AdvancedAIBehaviors
extends RefCounted

enum MissionType {
	SUPPLY_RUN,
	RECONNAISSANCE,
	MERCHANT_ESCORT,
	BORDER_PATROL,
	SEARCH_AND_RESCUE
}

enum WeatherResponse {
	NORMAL,
	CAUTIOUS,
	SEEK_SHELTER
}

enum Formation {
	LINE_ABREAST,
	COLUMN,
	WEDGE,
	DIAMOND,
	CIRCLE
}

static func get_mission_behavior(navy_ship: NavyAI, mission_type: MissionType) -> Dictionary:
	match mission_type:
		MissionType.SUPPLY_RUN:
			return setup_supply_run_behavior(navy_ship)
		MissionType.RECONNAISSANCE:
			return setup_reconnaissance_behavior(navy_ship)
		MissionType.MERCHANT_ESCORT:
			return setup_merchant_escort_behavior(navy_ship)
		MissionType.BORDER_PATROL:
			return setup_border_patrol_behavior(navy_ship)
		MissionType.SEARCH_AND_RESCUE:
			return setup_search_rescue_behavior(navy_ship)
		_:
			return {}

static func setup_supply_run_behavior(navy_ship: NavyAI) -> Dictionary:
	var behavior = {
		"mission_type": "Supply Run",
		"waypoints": [],
		"cargo_capacity": 5,
		"current_cargo": 0,
		"delivery_targets": [],
		"pickup_locations": [],
		"urgency_level": "Medium"
	}
	
	var structures = World.get_all_structures()
	var ports = []
	var towns = []
	
	for structure in structures:
		if structure.type == StructurePool.StructureType.PORT:
			ports.append(structure.grid_position)
		elif structure.type == StructurePool.StructureType.CITY or structure.type == StructurePool.StructureType.VILLAGE:
			towns.append(structure.grid_position)
	
	if ports.size() > 0 and towns.size() > 0:
		behavior["pickup_locations"] = ports.slice(0, 2)
		behavior["delivery_targets"] = towns.slice(0, 3)
		
		var route = ports + towns
		route.shuffle()
		behavior["waypoints"] = route
	
	return behavior

static func setup_reconnaissance_behavior(navy_ship: NavyAI) -> Dictionary:
	var behavior = {
		"mission_type": "Reconnaissance",
		"patrol_sectors": [],
		"reporting_interval": 30.0,
		"stealth_mode": true,
		"observation_range": 15,
		"intel_gathered": [],
		"priority_targets": ["dragons", "pirates", "unknown_ships"]
	}
	
	var map_center = Vector2i(World.MAP_WIDTH / 2, World.MAP_HEIGHT / 2)
	var sector_size = 25
	
	for i in range(4):
		var angle = i * PI / 2
		var sector_center = Vector2i(
			map_center.x + int(cos(angle) * 40),
			map_center.y + int(sin(angle) * 40)
		)
		
		var sector = {
			"center": sector_center,
			"radius": sector_size,
			"last_visited": 0,
			"threat_level": "Unknown"
		}
		behavior["patrol_sectors"].append(sector)
	
	return behavior

static func setup_merchant_escort_behavior(navy_ship: NavyAI) -> Dictionary:
	var behavior = {
		"mission_type": "Merchant Escort",
		"escort_formation": Formation.DIAMOND,
		"escort_distance": 8,
		"threat_response": "Aggressive Defense",
		"merchant_ship": null,
		"route_waypoints": [],
		"convoy_speed": "Slow",
		"protection_priority": "Merchant Safety"
	}
	
	return behavior

static func setup_border_patrol_behavior(navy_ship: NavyAI) -> Dictionary:
	var behavior = {
		"mission_type": "Border Patrol",
		"patrol_boundary": [],
		"inspection_authority": true,
		"contraband_detection": true,
		"checkpoint_locations": [],
		"patrol_schedule": "Day/Night",
		"border_violations": []
	}
	
	var border_points = []
	var border_width = 10
	
	for i in range(0, World.MAP_WIDTH, 30):
		border_points.append(Vector2i(i, border_width))
		border_points.append(Vector2i(i, World.MAP_HEIGHT - border_width))
	
	for i in range(0, World.MAP_HEIGHT, 30):
		border_points.append(Vector2i(border_width, i))
		border_points.append(Vector2i(World.MAP_WIDTH - border_width, i))
	
	behavior["patrol_boundary"] = border_points
	behavior["checkpoint_locations"] = border_points.slice(0, 4)
	
	return behavior

static func setup_search_rescue_behavior(navy_ship: NavyAI) -> Dictionary:
	var behavior = {
		"mission_type": "Search and Rescue",
		"search_pattern": "Grid",
		"rescue_equipment": ["Medical Supplies", "Ropes", "Emergency Rations"],
		"search_area": [],
		"survivors_found": 0,
		"search_duration": 120.0,
		"emergency_protocols": true
	}
	
	return behavior

static func execute_advanced_behavior(navy_ship: NavyAI, behavior: Dictionary):
	var mission_type = behavior.get("mission_type", "")
	
	match mission_type:
		"Supply Run":
			execute_supply_run(navy_ship, behavior)
		"Reconnaissance":
			execute_reconnaissance(navy_ship, behavior)
		"Merchant Escort":
			execute_merchant_escort(navy_ship, behavior)
		"Border Patrol":
			execute_border_patrol(navy_ship, behavior)
		"Search and Rescue":
			execute_search_rescue(navy_ship, behavior)

static func execute_supply_run(navy_ship: NavyAI, behavior: Dictionary):
	var waypoints = behavior.get("waypoints", [])
	if waypoints.size() == 0:
		return
	
	var current_target = waypoints[0]
	var distance_to_target = abs(navy_ship.grid_position.x - current_target.x) + abs(navy_ship.grid_position.y - current_target.y)
	
	if distance_to_target <= 3:
		print("Navy ship ", navy_ship.name, " reached supply waypoint")
		waypoints.remove_at(0)
		behavior["waypoints"] = waypoints
		
		if waypoints.size() == 0:
			print("Supply run completed, returning to dock")
			navy_ship.transition_to_navy_state(NavyAI.NavyState.DOCK_PATROL)

static func execute_reconnaissance(navy_ship: NavyAI, behavior: Dictionary):
	var sectors = behavior.get("patrol_sectors", [])
	if sectors.size() == 0:
		return
	
	var current_time = Time.get_ticks_msec() / 1000.0
	var oldest_sector = null
	var oldest_time = current_time
	
	for sector in sectors:
		var last_visited = sector.get("last_visited", 0)
		if last_visited < oldest_time:
			oldest_time = last_visited
			oldest_sector = sector
	
	if oldest_sector:
		var sector_center = oldest_sector["center"]
		var distance = abs(navy_ship.grid_position.x - sector_center.x) + abs(navy_ship.grid_position.y - sector_center.y)
		
		if distance <= oldest_sector["radius"]:
			oldest_sector["last_visited"] = current_time
			gather_intelligence(navy_ship, oldest_sector, behavior)

static func gather_intelligence(navy_ship: NavyAI, sector: Dictionary, behavior: Dictionary):
	var intel_gathered = behavior.get("intel_gathered", [])
	var observation_range = behavior.get("observation_range", 15)
	
	var nearby_entities = []
	var all_npcs = World.get_npcs()
	
	for npc in all_npcs:
		if npc and is_instance_valid(npc) and npc != navy_ship:
			var distance = abs(navy_ship.grid_position.x - npc.grid_position.x) + abs(navy_ship.grid_position.y - npc.grid_position.y)
			if distance <= observation_range:
				nearby_entities.append(npc)
	
	var dragons = World.get_dragons()
	for dragon in dragons:
		if dragon and is_instance_valid(dragon):
			var distance = abs(navy_ship.grid_position.x - dragon.grid_position.x) + abs(navy_ship.grid_position.y - dragon.grid_position.y)
			if distance <= observation_range:
				nearby_entities.append(dragon)
	
	if nearby_entities.size() > 0:
		var intel_report = {
			"timestamp": Time.get_ticks_msec() / 1000.0,
			"location": sector["center"],
			"entities_observed": nearby_entities.size(),
			"threat_assessment": "Low" if nearby_entities.size() <= 2 else "Medium"
		}
		intel_gathered.append(intel_report)
		behavior["intel_gathered"] = intel_gathered
		
		print("Navy reconnaissance: ", nearby_entities.size(), " entities observed at sector ", sector["center"])

static func execute_merchant_escort(navy_ship: NavyAI, behavior: Dictionary):
	var merchant_ship = behavior.get("merchant_ship")
	var escort_distance = behavior.get("escort_distance", 8)
	
	if not merchant_ship or not is_instance_valid(merchant_ship):
		print("Merchant ship lost, ending escort mission")
		navy_ship.transition_to_navy_state(NavyAI.NavyState.DOCK_PATROL)
		return
	
	var merchant_pos = Vector2i(int(merchant_ship.position.x / World.TILE_SIZE), int(merchant_ship.position.y / World.TILE_SIZE))
	var distance_to_merchant = abs(navy_ship.grid_position.x - merchant_pos.x) + abs(navy_ship.grid_position.y - merchant_pos.y)
	
	if distance_to_merchant > escort_distance:
		navy_ship.help_target_position = merchant_pos
		navy_ship.is_responding_to_help = true

static func execute_border_patrol(navy_ship: NavyAI, behavior: Dictionary):
	var patrol_boundary = behavior.get("patrol_boundary", [])
	var checkpoint_locations = behavior.get("checkpoint_locations", [])
	
	if checkpoint_locations.size() == 0:
		return
	
	var nearest_checkpoint = null
	var nearest_distance = INF
	
	for checkpoint in checkpoint_locations:
		var distance = abs(navy_ship.grid_position.x - checkpoint.x) + abs(navy_ship.grid_position.y - checkpoint.y)
		if distance < nearest_distance:
			nearest_distance = distance
			nearest_checkpoint = checkpoint
	
	if nearest_checkpoint and nearest_distance <= 5:
		perform_border_inspection(navy_ship, nearest_checkpoint, behavior)

static func perform_border_inspection(navy_ship: NavyAI, checkpoint: Vector2i, behavior: Dictionary):
	var inspection_range = 10
	var suspicious_activity = false
	
	var all_npcs = World.get_npcs()
	for npc in all_npcs:
		if npc and is_instance_valid(npc) and npc != navy_ship:
			var distance = abs(npc.grid_position.x - checkpoint.x) + abs(npc.grid_position.y - checkpoint.y)
			if distance <= inspection_range:
				if npc.current_health < npc.max_health * 0.5:
					suspicious_activity = true
					break
	
	if suspicious_activity:
		var violation = {
			"location": checkpoint,
			"timestamp": Time.get_ticks_msec() / 1000.0,
			"type": "Suspicious Activity"
		}
		var violations = behavior.get("border_violations", [])
		violations.append(violation)
		behavior["border_violations"] = violations
		
		print("Border patrol detected suspicious activity at ", checkpoint)

static func execute_search_rescue(navy_ship: NavyAI, behavior: Dictionary):
	var search_area = behavior.get("search_area", [])
	var search_pattern = behavior.get("search_pattern", "Grid")
	
	if search_area.size() == 0:
		var search_center = navy_ship.grid_position
		var search_radius = 20
		
		for x in range(search_center.x - search_radius, search_center.x + search_radius, 5):
			for y in range(search_center.y - search_radius, search_center.y + search_radius, 5):
				if x >= 0 and x < World.MAP_WIDTH and y >= 0 and y < World.MAP_HEIGHT:
					search_area.append(Vector2i(x, y))
		
		behavior["search_area"] = search_area
	
	if search_area.size() > 0:
		var search_target = search_area[0]
		var distance = abs(navy_ship.grid_position.x - search_target.x) + abs(navy_ship.grid_position.y - search_target.y)
		
		if distance <= 3:
			search_area.remove_at(0)
			behavior["search_area"] = search_area
			perform_rescue_search(navy_ship, search_target, behavior)

static func perform_rescue_search(navy_ship: NavyAI, location: Vector2i, behavior: Dictionary):
	var search_range = 5
	var survivors_found = behavior.get("survivors_found", 0)
	
	var damaged_ships = []
	var all_npcs = World.get_npcs()
	
	for npc in all_npcs:
		if npc and is_instance_valid(npc) and npc != navy_ship:
			var distance = abs(npc.grid_position.x - location.x) + abs(npc.grid_position.y - location.y)
			if distance <= search_range and npc.current_health < npc.max_health * 0.3:
				damaged_ships.append(npc)
	
	if damaged_ships.size() > 0:
		survivors_found += damaged_ships.size()
		behavior["survivors_found"] = survivors_found
		print("Search and rescue found ", damaged_ships.size(), " ships in distress at ", location)
		
		for ship in damaged_ships:
			if ship.has_method("receive_rescue_assistance"):
				ship.receive_rescue_assistance(navy_ship)

static func get_weather_response(weather_condition: String) -> WeatherResponse:
	match weather_condition:
		"Storm", "Heavy Rain", "Fog":
			return WeatherResponse.SEEK_SHELTER
		"Light Rain", "Overcast", "Wind":
			return WeatherResponse.CAUTIOUS
		_:
			return WeatherResponse.NORMAL

static func apply_formation_movement(leader: NavyAI, members: Array[NavyAI], formation: Formation):
	var formation_positions = get_formation_positions(leader.grid_position, formation, members.size())
	
	for i in range(min(members.size(), formation_positions.size())):
		var member = members[i]
		var target_pos = formation_positions[i]
		
		if member and is_instance_valid(member):
			member.help_target_position = target_pos

static func get_formation_positions(leader_pos: Vector2i, formation: Formation, member_count: int) -> Array[Vector2i]:
	var positions: Array[Vector2i] = []
	var spacing = 3
	
	match formation:
		Formation.LINE_ABREAST:
			for i in range(member_count):
				positions.append(Vector2i(leader_pos.x + (i + 1) * spacing, leader_pos.y))
		Formation.COLUMN:
			for i in range(member_count):
				positions.append(Vector2i(leader_pos.x, leader_pos.y + (i + 1) * spacing))
		Formation.WEDGE:
			var side = 1
			for i in range(member_count):
				positions.append(Vector2i(
					leader_pos.x + side * ((i / 2) + 1) * spacing,
					leader_pos.y + ((i / 2) + 1) * spacing
				))
				side *= -1
		Formation.DIAMOND:
			if member_count >= 1:
				positions.append(Vector2i(leader_pos.x, leader_pos.y - spacing))
			if member_count >= 2:
				positions.append(Vector2i(leader_pos.x + spacing, leader_pos.y))
			if member_count >= 3:
				positions.append(Vector2i(leader_pos.x, leader_pos.y + spacing))
			if member_count >= 4:
				positions.append(Vector2i(leader_pos.x - spacing, leader_pos.y))
		Formation.CIRCLE:
			for i in range(member_count):
				var angle = (2.0 * PI * i) / member_count
				positions.append(Vector2i(
					leader_pos.x + int(cos(angle) * spacing),
					leader_pos.y + int(sin(angle) * spacing)
				))
	
	return positions
