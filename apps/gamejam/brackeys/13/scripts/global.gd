extends Node

const SAVE_PATH = "user://player_save.json"

## Signals
signal resource_changed(resource_name, new_value)
signal resource_receipt(resource_name, amount, new_value, invoice)
signal starship_stat_changed(stat_name, new_value)
signal starship_data_changed(data_name, new_value)
signal environment_data_changed(data_name, new_value)
signal notification_received(message_id: String, message: String, type: String)
signal entity_destroyed(entity_type: String, entity_id: int, additional_data: Dictionary)

@export var resources_list: Array[String] = ["gold", "stone", "metal", "gems"]

var environment_data := {
	"asteroids": 20,
	"universe_objects":15,
	"asteroid_speed": 200,
	"asteroid_belt": false
}

var resources := {
	"gold": 0,
	"stone": 0,
	"metal": 0,
	"gems": 0
}

var base_starship_stats := {
	"acceleration": 15.0,
	"max_speed": 400.0,
	"rotation_speed": 270.0,
	"laser_speed": 550.0,
	"overheat": 0.0,
	"laser_ammo": 10.0,
}

var starship_bonuses := {
	"acceleration": 0.0,
	"max_speed": 0.0,
	"rotation_speed": 0.0,
	"laser_speed": 0.0,
	"overheat": 0.0,
	"laser_ammo": 0.0
}

var starship_data := {
	"name": "Explorer-X",
	"emergency_rockets_used": false,
	"shield_active": false,
	"coordinates": Vector2.ZERO,
	"heat": 0.0
}

func earn_random_resource(resource_name: String, min_value: int = 3, max_value: int = 15):
	var amount = randi_range(min_value, max_value)
	earn_resource(resource_name, amount)


func earn_resource(resource_name: String, amount: int, invoice: String = "Earned"):
	if amount <= 0:
		return 

	if not resources.has(resource_name):
		resources[resource_name] = 0

	resources[resource_name] += amount
	emit_signal("resource_receipt", resource_name, amount, resources[resource_name], invoice)
	emit_signal("resource_changed", resource_name, resources[resource_name])


func spend_resource(resource_name: String, cost: int, invoice: String = "Purchase") -> bool:
	if cost <= 0:
		return false

	if not resources.has(resource_name):
		return false

	if resources[resource_name] >= cost:
		resources[resource_name] -= cost
		emit_signal("resource_receipt", resource_name, -cost, resources[resource_name], invoice)
		emit_signal("resource_changed", resource_name, resources[resource_name])
		return true
	else:
		return false

func get_resource(resource_name: String) -> int:
	return resources.get(resource_name, 0)

func get_starship_stat(stat_name: String) -> float:
	if not base_starship_stats.has(stat_name):
		return 0.0
	return base_starship_stats[stat_name] + starship_bonuses.get(stat_name, 0.0)

func apply_starship_bonus(stat_name: String, bonus: float):
	if not base_starship_stats.has(stat_name):
		print("not applying bonus")
		return
	starship_bonuses[stat_name] += bonus
	print("applied bonus")
	emit_signal("starship_stat_changed", stat_name, get_starship_stat(stat_name))

func reset_starship_bonus(stat_name: String):
	if not base_starship_stats.has(stat_name):
		return
	starship_bonuses[stat_name] = 0.0
	emit_signal("starship_stat_changed", stat_name, get_starship_stat(stat_name))

func set_base_starship_stat(stat_name: String, new_value: float):
	if not base_starship_stats.has(stat_name):
		return
	base_starship_stats[stat_name] = new_value
	emit_signal("starship_stat_changed", stat_name, get_starship_stat(stat_name))

func get_starship_data(data_name: String):
	if not starship_data.has(data_name):
		return null
	return starship_data[data_name]
	
func set_starship_data(data_name: String, new_value):
	# print("set_starship_data called from:", get_stack()[1].source, "-> Setting", data_name, "to", new_value)
	starship_data[data_name] = new_value
	emit_signal("starship_data_changed", data_name, new_value)
	
func get_environment_data(data_name: String):
	return environment_data.get(data_name, null)

func set_environment_data(data_name: String, new_value):
	environment_data[data_name] = new_value
	emit_signal("environment_data_changed", data_name, new_value)

func get_starship_coordinates() -> Vector2:
	return starship_data.get("coordinates", Vector2.ZERO)

func set_starship_coordinates(new_position: Vector2):
	starship_data["coordinates"] = new_position
	call_deferred("emit_signal", "starship_data_changed", "coordinates", new_position)


func save_player_data() -> bool:
	var save_data = {
		"resources": resources,
		"base_starship_stats": base_starship_stats,
		"starship_bonuses": starship_bonuses,
		"starship_data": starship_data,
		"environment_data": environment_data
	}
	
	var file = FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(save_data, "\t"))
		file.close()
		print("Player data saved successfully.")
		return true
	else:
		print("Failed to save player data.")
		return false

func load_player_data() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		print("No save file found.")
		return false
	
	var file = FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file:
		var content = file.get_as_text()
		file.close()
		
		var parsed_data = JSON.parse_string(content)
		if parsed_data is Dictionary:
			resources.merge(parsed_data.get("resources", {}), true)
			base_starship_stats.merge(parsed_data.get("base_starship_stats", {}), true)
			starship_bonuses.merge(parsed_data.get("starship_bonuses", {}), true)
			starship_data.merge(parsed_data.get("starship_data", {}), true)
			environment_data.merge(parsed_data.get("environment_data", {}), true)

			print("Player data loaded successfully.")
			return true
		else:
			print("Failed to parse save file.")
			return false
	
	return false
