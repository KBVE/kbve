class_name Spaceship extends CharacterBody2D


signal laser_shot(laser)

@onready var scope = $OmniScope
@onready var engine = $Engine
@onready var shield = $Shield

# Heat
var last_heat_increase_time = 0.0
var heat_increase_interval = 30.0


var laser_scene = preload("res://scenes/laser.tscn")

func _ready():
	position = get_viewport_rect().size / 2
	shield.animation_finished.connect(_engine_cleanup)
	engine.animation_finished.connect(_engine_buildup)

	
func _process(delta):
	if Input.is_action_pressed("shoot"):
		shield.visible = false
		shoot_laser()
	call_deferred("defer_set_starship_coordinates")
	

func _physics_process(delta):
	var acceleration = Global.get_starship_stat("acceleration")
	var max_speed = Global.get_starship_stat("max_speed")
	var rotation_speed = Global.get_starship_stat("rotation_speed")
	var input_vector := Vector2(0, Input.get_axis("thrust", "reverse"))
	var heat = Global.get_starship_data("heat") as int
	
	if heat == null:
		heat = 0

	if input_vector.y != 0 and Time.get_ticks_msec() / 1000.0 - last_heat_increase_time >= heat_increase_interval:
		last_heat_increase_time = Time.get_ticks_msec() / 1000.0
		Global.set_starship_data("heat", heat + 1)
		print("Heat increased:", heat + 1)

	if heat >= 100:
		Global.emit_signal("notification_received", "heat_error", "Ship is Overheating!", "error")
		input_vector = Vector2.ZERO
		exhaust()


	velocity += input_vector.rotated(rotation) * acceleration
	velocity = velocity.limit_length(max_speed)
	
	if input_vector or velocity.length() > 0.1:
		engine.play("engine")
	else:
		engine.stop()
	
	if Input.is_action_pressed("pan_right"):
		rotate(deg_to_rad(rotation_speed*delta))
	if Input.is_action_pressed("pan_left"):
		rotate(deg_to_rad(-rotation_speed*delta))
	
	var drift_force = acceleration * 1.0
	var drift_direction = Vector2.RIGHT.rotated(rotation)
	
	if Input.is_action_pressed("drift_right"):
		#print("E Pressed - Thrust Right Detected")
		global_position = global_position.lerp(global_position + drift_direction * drift_force, delta * 5)
		short_exhaust()

		
	if Input.is_action_pressed("drift_left"):
		#print("Q Pressed - Thrust Left Detected")
		global_position = global_position.lerp(global_position - drift_direction * drift_force, delta * 5)
		short_exhaust()

	if input_vector.y == 0:
		velocity = velocity.move_toward(Vector2.ZERO, 3)
	
	
	move_and_slide()
	
	#var screen_size = get_viewport_rect().size
	#if global_position.y < 0:
		#global_position.y = screen_size.y
	#elif global_position.y > screen_size.y:
		#global_position.y = 0
	#if global_position.x < 0:
		#global_position.x = screen_size.x
	#elif global_position.x > screen_size.x:
		#global_position.x = 0

func shoot_laser():
	emit_signal("laser_shot", scope.global_position, rotation)

func _engine_cleanup():
	if shield.animation == "exhaust":
		Global.emit_signal("notification_received", "engine_cleanup", "Engine bay is now cold.", "success")
		Global.set_starship_data("heat", 1)
	if shield.animation == "short_exhaust":
		Global.emit_signal("notification_received", "engine_short", "Short Exhaust Engaged", "success")
		Global.set_starship_data("heat", ((Global.get_starship_data("heat") as int) / 2) as int)

func _engine_buildup():
	if engine.animation == "engine":
		Global.set_starship_data("heat", (Global.get_starship_data("heat") as int) + 1)

func exhaust():
	shield.play("exhaust")

func short_exhaust():
	shield.play("short_exhaust")

func activate_shield():
	Global.emit_signal("notification_received", "shield_active", "Shield was deployed", "warning")
	Global.set_starship_data("heat", (Global.get_starship_data("heat") as int) + 1)
	shield.visible = true
	shield.play("shield")

func defer_set_starship_coordinates():
	Global.set_starship_coordinates(global_position)
