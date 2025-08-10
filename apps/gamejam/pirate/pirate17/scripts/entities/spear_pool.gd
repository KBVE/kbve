class_name SpearPool
extends Node2D

# Pool configuration
@export var pool_size: int = 50
var available_spears: Array[Spear] = []
var active_spears: Array[Spear] = []

func _ready():
	name = "SpearPool"
	z_index = 10
	create_spear_pool()
	print("SpearPool initialized with ", pool_size, " spears")

func create_spear_pool():
	"""Create the initial pool of spears"""
	var spear_scene = preload("res://scenes/entities/spear/spear.tscn")
	for i in range(pool_size):
		var spear = spear_scene.instantiate()
		spear.reset_spear()
		available_spears.append(spear)
		add_child(spear)

func get_spear() -> Spear:
	"""Get an available spear from the pool"""
	if available_spears.size() > 0:
		var spear = available_spears.pop_back()
		active_spears.append(spear)
		return spear
	else:
		print("SpearPool: No spears available! Pool exhausted.")
		return null

func return_spear(spear: Spear):
	"""Return a spear to the available pool"""
	if spear in active_spears:
		active_spears.erase(spear)
		available_spears.append(spear)

func launch_spear(start_pos: Vector2, target_pos: Vector2, speed: float = 300.0, damage: int = 2, owner: Node2D = null) -> bool:
	"""Launch a spear from the pool"""
	var spear = get_spear()
	if spear:
		return spear.launch(start_pos, target_pos, speed, damage, owner)
	return false

func get_pool_stats() -> Dictionary:
	"""Get statistics about the spear pool"""
	return {
		"total_spears": pool_size,
		"available": available_spears.size(),
		"active": active_spears.size(),
		"utilization": float(active_spears.size()) / float(pool_size)
	}

func clear_all_spears():
	"""Clear all spears and reset the pool"""
	for spear in active_spears:
		if spear and is_instance_valid(spear):
			spear.deactivate_spear()
	
	active_spears.clear()
	
	# Reset all spears to available
	for spear in available_spears:
		if spear and is_instance_valid(spear):
			spear.reset_spear()