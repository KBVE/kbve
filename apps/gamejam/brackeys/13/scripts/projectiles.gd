extends Node

const LASER_SCENE = preload("res://scenes/laser.tscn")
var laser_pool: Array = []
var active_lasers: Array = []

func initialize_pool(size: int):
	for i in range(size):
		var laser = LASER_SCENE.instantiate()
		laser.connect("tree_exited", _on_laser_exited.bind(laser))
		laser.set_deferred("visible", false)
		laser_pool.append(laser)
		add_child(laser)

func shoot_laser(global_position: Vector2, rotation: float):
	if laser_pool.size() > 0:
		var laser = laser_pool.pop_back()
		laser.global_position = global_position
		laser.rotation = rotation
		laser.set_deferred("visible", true)
		active_lasers.append(laser)
	else:
		Global.emit_signal("notification_received","laser_low", "Laser Overheating", "error")
		Global.set_starship_data("heat", (Global.get_starship_data("heat") as int) + 1)

		#print("Out of laser energy shots")

func _on_laser_exited(laser):
	if laser in active_lasers:
		active_lasers.erase(laser)
	laser.set_deferred("visible", false)
	laser_pool.append(laser)

func dynamic_pool_adjustment():
	var desired_pool_size = int(Global.get_starship_stat("laser_ammo"))
	var current_pool_size = laser_pool.size() + active_lasers.size()

	if desired_pool_size > current_pool_size:
		for i in range(desired_pool_size - current_pool_size):
			var laser = LASER_SCENE.instantiate()
			laser.connect("screen_exited", Callable(self, "_on_laser_exited").bind(laser))
			laser.set_deferred("visible", false)
			laser_pool.append(laser)
			add_child(laser)
		Global.emit_signal("notification_received","laser_upgrade", "Laser Upgraded", "info")
		print("Laser pool increased to:", desired_pool_size)

	elif desired_pool_size < current_pool_size:
		var remove_count = current_pool_size - desired_pool_size
		for i in range(remove_count):
			if laser_pool.size() > 0:
				var laser = laser_pool.pop_back()
				laser.queue_free()
		Global.emit_signal("notification_received","laser_downgrade", "Laser Downgraded", "warning")
		print("Laser pool decreased to:", desired_pool_size)
