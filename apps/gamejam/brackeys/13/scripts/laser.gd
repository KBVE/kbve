extends Area2D

var movement_vector := Vector2(0, -1)

func _physics_process(delta):
	var laser_speed = Global.get_starship_stat("laser_speed")
	global_position += movement_vector.rotated(rotation) * laser_speed * delta

func _on_visible_on_screen_notifier_2d_screen_exited():
	visible = false
	if get_parent():
		get_parent()._on_laser_exited(self)
	#queue_free()


func _on_area_entered(area):
	if area is Asteroid:
		var asteroid = area
		asteroid.destroy()
		Global.emit_signal("notification_received", "asteroid_hit", "Asteroid was destoried!", "success")
		Global.earn_resource("stone", 10)
		visible = false
		if get_parent():
			get_parent()._on_laser_exited(self)
