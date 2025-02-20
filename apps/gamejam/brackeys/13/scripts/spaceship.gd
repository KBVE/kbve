class_name Spaceship extends CharacterBody2D

signal laser_shot(laser)

@onready var scope = $OmniScope

var laser_scene = preload("res://scenes/laser.tscn")

func _ready():
	position = get_viewport_rect().size / 2
	
func _process(delta):
	if Input.is_action_pressed("shoot"):
		shoot_laser()

func _physics_process(delta):
	var acceleration = Global.get_starship_stat("acceleration")
	var max_speed = Global.get_starship_stat("max_speed")
	var rotation_speed = Global.get_starship_stat("rotation_speed")
	var input_vector := Vector2(0, Input.get_axis("thrust", "reverse"))
	velocity += input_vector.rotated(rotation) * acceleration
	velocity = velocity.limit_length(max_speed)
	
	if Input.is_action_pressed("pan_right"):
		rotate(deg_to_rad(rotation_speed*delta))
	if Input.is_action_pressed("pan_left"):
		rotate(deg_to_rad(-rotation_speed*delta))
	
	var drift_force = acceleration * 1.0
	var drift_direction = Vector2.RIGHT.rotated(rotation)
	
	if Input.is_action_pressed("drift_right"):
		print("E Pressed - Thrust Right Detected")
		global_position = global_position.lerp(global_position + drift_direction * drift_force, delta * 5)

		
	if Input.is_action_pressed("drift_left"):
		print("Q Pressed - Thrust Left Detected")
		global_position = global_position.lerp(global_position - drift_direction * drift_force, delta * 5)

	if input_vector.y == 0:
		velocity = velocity.move_toward(Vector2.ZERO, 3)
	
	
	move_and_slide()
	
	var screen_size = get_viewport_rect().size
	if global_position.y < 0:
		global_position.y = screen_size.y
	elif global_position.y > screen_size.y:
		global_position.y = 0
	if global_position.x < 0:
		global_position.x = screen_size.x
	elif global_position.x > screen_size.x:
		global_position.x = 0

func shoot_laser():
	emit_signal("laser_shot", scope.global_position, rotation)
