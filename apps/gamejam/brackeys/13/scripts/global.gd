extends Node

## Signals
signal resource_changed(resource_name, new_value)
signal resource_receipt(resource_name, amount, new_value, invoice)
signal starship_stat_changed(stat_name, new_value)

var resources := {
	"gold": 0,
	"stone": 0,
	"metal": 0,
	"gems": 0
}

var base_starship_stats := {
	"acceleration": 10.0,
	"max_speed": 350.0,
	"rotation_speed": 250.0
}

var starship_bonuses := {
	"acceleration": 0.0,
	"max_speed": 0.0,
	"rotation_speed": 0.0
}

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
		return
	starship_bonuses[stat_name] += bonus
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
