class_name FireballPool
extends Node2D

# Pool configuration
var pool_size: int = 20
var fireball_scene = preload("res://scenes/entities/fireball.tscn")

# Pool management
var available_fireballs: Array[Fireball] = []
var active_fireballs: Array[Fireball] = []

func _ready():
	# Initialize the pool
	for i in range(pool_size):
		var fireball = fireball_scene.instantiate()
		add_child(fireball)
		available_fireballs.append(fireball)
	
	print("Fireball pool initialized with ", pool_size, " fireballs")

func launch_fireball(start_pos: Vector2, target_pos: Vector2, speed: float, damage: int = 1, owner: Node2D = null) -> bool:
	"""Launch a fireball from the pool"""
	if available_fireballs.is_empty():
		print("No fireballs available in pool!")
		return false
	
	# Get a fireball from the pool
	var fireball = available_fireballs.pop_back()
	active_fireballs.append(fireball)
	
	# Launch it
	var success = fireball.launch(start_pos, target_pos, speed, damage, owner)
	
	if not success:
		# Return to pool if launch failed
		return_fireball(fireball)
		return false
	
	return true

func return_fireball(fireball: Fireball):
	"""Return a fireball to the pool"""
	if fireball in active_fireballs:
		active_fireballs.erase(fireball)
		available_fireballs.append(fireball)

func get_pool_stats() -> Dictionary:
	"""Get current pool statistics"""
	return {
		"total": pool_size,
		"available": available_fireballs.size(),
		"active": active_fireballs.size()
	}