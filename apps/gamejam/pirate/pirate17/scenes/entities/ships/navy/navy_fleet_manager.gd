class_name NavyFleetManager
extends Node

signal formation_created(leader: NavyAI, members: Array[NavyAI])
signal fleet_alert(alert_level: String)

var active_navy_ships: Array[NavyAI] = []
var formations: Array[Dictionary] = []
var dock_assignments: Dictionary = {}
var patrol_schedules: Array[Dictionary] = []
var alert_level: String = "Green"

enum AlertLevel {
	GREEN,
	YELLOW,
	ORANGE, 
	RED
}

var current_alert: AlertLevel = AlertLevel.GREEN
var threat_assessment_timer: Timer

func _ready():
	setup_threat_assessment_timer()
	call_deferred("discover_navy_ships")

func setup_threat_assessment_timer():
	threat_assessment_timer = Timer.new()
	threat_assessment_timer.wait_time = 5.0
	threat_assessment_timer.timeout.connect(_on_threat_assessment)
	threat_assessment_timer.autostart = true
	add_child(threat_assessment_timer)

func discover_navy_ships():
	var all_npcs = World.get_npcs()
	for npc in all_npcs:
		if npc and is_instance_valid(npc) and npc is NavyAI:
			register_navy_ship(npc as NavyAI)

func register_navy_ship(ship: NavyAI):
	if ship not in active_navy_ships:
		active_navy_ships.append(ship)
		assign_ship_to_dock(ship)
		print("Fleet Manager: Registered navy ship - Total active: ", active_navy_ships.size())

func assign_ship_to_dock(ship: NavyAI):
	var available_docks = get_available_docks()
	if available_docks.size() == 0:
		return
	
	var assigned_dock = find_least_crowded_dock(available_docks)
	dock_assignments[ship] = assigned_dock
	ship.assigned_dock = assigned_dock
	ship.home_dock = assigned_dock

func get_available_docks() -> Array[Vector2i]:
	var docks: Array[Vector2i] = []
	var structures = World.get_all_structures()
	
	for structure in structures:
		if structure.type == StructurePool.StructureType.PORT:
			docks.append(structure.grid_position)
	
	return docks

func find_least_crowded_dock(docks: Array[Vector2i]) -> Vector2i:
	var dock_counts = {}
	
	for dock in docks:
		dock_counts[dock] = 0
	
	for ship in dock_assignments.keys():
		if ship and is_instance_valid(ship):
			var assigned_dock = dock_assignments[ship]
			if assigned_dock in dock_counts:
				dock_counts[assigned_dock] += 1
	
	var least_crowded_dock = docks[0]
	var lowest_count = dock_counts[least_crowded_dock]
	
	for dock in docks:
		if dock_counts[dock] < lowest_count:
			lowest_count = dock_counts[dock]
			least_crowded_dock = dock
	
	return least_crowded_dock

func _on_threat_assessment():
	assess_overall_threat_level()
	manage_formations()
	coordinate_patrol_schedules()

func assess_overall_threat_level():
	var player_pos = get_player_position()
	if player_pos == Vector2i(-1, -1):
		return
	
	var ships_under_attack = 0
	var ships_damaged = 0
	var ships_near_player = 0
	
	for ship in active_navy_ships:
		if not ship or not is_instance_valid(ship):
			continue
		
		var health_percent = float(ship.current_health) / float(ship.max_health)
		if health_percent < 0.7:
			ships_damaged += 1
		
		if ship.current_state == NPC.NPCState.AGGRESSIVE:
			ships_under_attack += 1
		
		var distance_to_player = abs(ship.grid_position.x - player_pos.x) + abs(ship.grid_position.y - player_pos.y)
		if distance_to_player <= 15:
			ships_near_player += 1
	
	var new_alert = AlertLevel.GREEN
	
	if ships_under_attack >= 3 or ships_damaged >= 4:
		new_alert = AlertLevel.RED
	elif ships_under_attack >= 2 or ships_damaged >= 3 or ships_near_player >= 5:
		new_alert = AlertLevel.ORANGE
	elif ships_under_attack >= 1 or ships_damaged >= 2 or ships_near_player >= 3:
		new_alert = AlertLevel.YELLOW
	
	if new_alert != current_alert:
		current_alert = new_alert
		handle_alert_change()

func handle_alert_change():
	match current_alert:
		AlertLevel.GREEN:
			alert_level = "Green"
			return_to_normal_operations()
		AlertLevel.YELLOW:
			alert_level = "Yellow"
			increase_patrol_frequency()
		AlertLevel.ORANGE:
			alert_level = "Orange"
			form_defensive_formations()
		AlertLevel.RED:
			alert_level = "Red"
			activate_emergency_protocols()
	
	fleet_alert.emit(alert_level)
	print("Fleet Alert Level: ", alert_level)

func return_to_normal_operations():
	for ship in active_navy_ships:
		if ship and is_instance_valid(ship):
			if ship.navy_state == NavyAI.NavyState.DEFENSIVE_POSITION:
				ship.transition_to_navy_state(NavyAI.NavyState.DOCK_PATROL)

func increase_patrol_frequency():
	for ship in active_navy_ships:
		if ship and is_instance_valid(ship) and ship.navy_state == NavyAI.NavyState.DOCK_PATROL:
			if ship.movement_timer:
				ship.movement_timer.wait_time = randf_range(1.5, 2.5)

func form_defensive_formations():
	create_defensive_formations()

func activate_emergency_protocols():
	for ship in active_navy_ships:
		if ship and is_instance_valid(ship):
			if ship.current_health < ship.max_health * 0.5:
				ship.return_to_dock()
			elif ship.navy_state == NavyAI.NavyState.DOCK_PATROL:
				ship.transition_to_navy_state(NavyAI.NavyState.DEFENSIVE_POSITION)

func manage_formations():
	cleanup_broken_formations()
	
	if current_alert >= AlertLevel.ORANGE:
		create_formations_near_threats()

func cleanup_broken_formations():
	for i in range(formations.size() - 1, -1, -1):
		var formation = formations[i]
		var leader = formation.get("leader")
		var members = formation.get("members", [])
		
		if not leader or not is_instance_valid(leader):
			formations.remove_at(i)
			continue
		
		var valid_members = []
		for member in members:
			if member and is_instance_valid(member):
				valid_members.append(member)
		
		if valid_members.size() == 0:
			formations.remove_at(i)
			leader.is_formation_leader = false
		else:
			formation["members"] = valid_members

func create_formations_near_threats():
	var player_pos = get_player_position()
	if player_pos == Vector2i(-1, -1):
		return
	
	var nearby_ships = get_ships_near_position(player_pos, 20)
	
	if nearby_ships.size() >= 3:
		create_formation_from_ships(nearby_ships.slice(0, 4))

func get_ships_near_position(pos: Vector2i, radius: int) -> Array[NavyAI]:
	var nearby_ships: Array[NavyAI] = []
	
	for ship in active_navy_ships:
		if ship and is_instance_valid(ship):
			var distance = abs(ship.grid_position.x - pos.x) + abs(ship.grid_position.y - pos.y)
			if distance <= radius and not ship.is_formation_leader and not ship.formation_leader:
				nearby_ships.append(ship)
	
	return nearby_ships

func create_formation_from_ships(ships: Array[NavyAI]):
	if ships.size() < 2:
		return
	
	var leader = ships[0]
	var members = ships.slice(1)
	
	leader.create_navy_formation(members)
	
	var formation_data = {
		"leader": leader,
		"members": members,
		"created_time": Time.get_ticks_msec()
	}
	formations.append(formation_data)
	
	formation_created.emit(leader, members)
	print("Fleet Manager: Created formation with ", members.size() + 1, " ships")

func create_defensive_formations():
	var available_ships = get_available_ships_for_formation()
	
	while available_ships.size() >= 3:
		var formation_ships = available_ships.slice(0, 3)
		create_formation_from_ships(formation_ships)
		
		for ship in formation_ships:
			available_ships.erase(ship)

func get_available_ships_for_formation() -> Array[NavyAI]:
	var available: Array[NavyAI] = []
	
	for ship in active_navy_ships:
		if ship and is_instance_valid(ship):
			if not ship.is_formation_leader and not ship.formation_leader:
				if ship.navy_state == NavyAI.NavyState.DOCK_PATROL:
					available.append(ship)
	
	return available

func coordinate_patrol_schedules():
	for ship in active_navy_ships:
		if ship and is_instance_valid(ship) and ship.navy_state == NavyAI.NavyState.DOCK_PATROL:
			if randf() < 0.1:
				randomize_patrol_timing(ship)

func randomize_patrol_timing(ship: NavyAI):
	if ship.movement_timer:
		ship.movement_timer.wait_time = randf_range(2.0, 4.0)

func get_player_position() -> Vector2i:
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("get_player_position"):
		return main_scene.get_player_position()
	return Vector2i(-1, -1)

func request_reinforcements(requesting_ship: NavyAI, threat_position: Vector2i):
	var available_ships = get_ships_near_position(requesting_ship.grid_position, 25)
	
	var reinforcements_sent = 0
	for ship in available_ships:
		if reinforcements_sent >= 2:
			break
			
		if ship != requesting_ship and ship.navy_state == NavyAI.NavyState.DOCK_PATROL:
			ship.respond_to_navy_distress(requesting_ship)
			reinforcements_sent += 1
	
	print("Fleet Manager: Sent ", reinforcements_sent, " reinforcements to assist ", requesting_ship.name)

func assign_escort_duty(ship: NavyAI, target: Node2D):
	ship.assign_escort_duty(target)
	print("Fleet Manager: Assigned escort duty to ", ship.name)

func recall_all_ships_to_docks():
	for ship in active_navy_ships:
		if ship and is_instance_valid(ship):
			ship.return_to_dock()
	print("Fleet Manager: All ships recalled to docks")

func get_fleet_status() -> Dictionary:
	var status = {
		"total_ships": active_navy_ships.size(),
		"alert_level": alert_level,
		"formations": formations.size(),
		"ships_at_dock": 0,
		"ships_on_patrol": 0,
		"ships_in_combat": 0,
		"ships_damaged": 0
	}
	
	for ship in active_navy_ships:
		if ship and is_instance_valid(ship):
			match ship.navy_state:
				NavyAI.NavyState.DOCK_PATROL:
					status["ships_on_patrol"] += 1
				NavyAI.NavyState.EMERGENCY_RETREAT:
					status["ships_at_dock"] += 1
			
			if ship.current_state == NPC.NPCState.AGGRESSIVE:
				status["ships_in_combat"] += 1
			
			var health_percent = float(ship.current_health) / float(ship.max_health)
			if health_percent < 0.7:
				status["ships_damaged"] += 1
	
	return status