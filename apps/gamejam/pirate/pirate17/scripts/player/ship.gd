class_name Ship
extends Node2D

@export var ship_texture_path: String = "res://assets/ship/airship.png"

var sprite: Sprite2D
var current_rotation: float = 0.0
var rotation_tween: Tween
var is_rotating: bool = false
var wind_particles: WindParticles

signal rotation_completed

func _ready():
	setup_sprite()
	setup_wind_particles()

func setup_sprite():
	sprite = Sprite2D.new()
	sprite.texture = load(ship_texture_path)
	
	# Single airship sprite - no frames needed
	# Sprite is already facing North (up)
	
	# Center the sprite
	sprite.position = Vector2.ZERO
	sprite.z_index = 5  # Above particles and map
	
	add_child(sprite)

func setup_wind_particles():
	"""Setup wind particle system for the ship"""
	wind_particles = WindParticles.new()
	wind_particles.position = Vector2(0, 15)  # Closer to ship, at the back
	wind_particles.z_index = 2  # Above map but behind ship sprite
	add_child(wind_particles)

func update_wind_effects(velocity: Vector2, moving: bool):
	"""Update wind particle effects based on ship movement"""
	if wind_particles:
		wind_particles.update_ship_movement(velocity, moving)

func update_direction_from_movement(from: Vector2i, to: Vector2i):
	"""Update sprite rotation based on movement vector with smooth animation"""
	var movement_vector = to - from
	
	if movement_vector == Vector2i.ZERO:
		return  # No movement, keep current rotation
	
	# Calculate angle in radians from the movement vector
	var angle = atan2(movement_vector.y, movement_vector.x)
	
	# Since the airship sprite is already facing North (up), we need to add 90 degrees
	# to align with the coordinate system where Y+ is down
	var target_angle = angle + PI / 2
	
	# Smooth rotation to the new angle
	rotate_to_angle_smooth(target_angle)

func rotate_to_angle(target_angle: float):
	"""Immediately rotate sprite to target angle (for manual control)"""
	if sprite:
		sprite.rotation = target_angle
		current_rotation = target_angle

func rotate_to_angle_smooth(target_angle: float, duration: float = 0.3):
	"""Smoothly animate rotation to target angle"""
	if not sprite:
		return
	
	# Stop any existing rotation animation
	if rotation_tween:
		rotation_tween.kill()
	
	# Calculate the shortest rotation path
	var current_angle = sprite.rotation
	var angle_diff = target_angle - current_angle
	
	# Normalize angle difference to [-π, π] range for shortest path
	while angle_diff > PI:
		angle_diff -= 2 * PI
	while angle_diff < -PI:
		angle_diff += 2 * PI
	
	var final_angle = current_angle + angle_diff
	
	# Create new tween for smooth rotation
	rotation_tween = create_tween()
	rotation_tween.set_ease(Tween.EASE_OUT)
	rotation_tween.set_trans(Tween.TRANS_CUBIC)
	
	is_rotating = true
	
	# Animate the rotation
	rotation_tween.tween_property(sprite, "rotation", final_angle, duration)
	rotation_tween.tween_callback(_on_rotation_complete)

func _on_rotation_complete():
	"""Called when rotation animation completes"""
	is_rotating = false
	current_rotation = sprite.rotation
	rotation_completed.emit()

func is_currently_rotating() -> bool:
	return is_rotating

func get_current_rotation() -> float:
	return current_rotation

# Convenience methods for manual direction setting
func face_north():
	rotate_to_angle(0)

func face_northeast():
	rotate_to_angle(PI / 4)

func face_east():
	rotate_to_angle(PI / 2)

func face_southeast():
	rotate_to_angle(3 * PI / 4)

func face_south():
	rotate_to_angle(PI)

func face_southwest():
	rotate_to_angle(5 * PI / 4)

func face_west():
	rotate_to_angle(3 * PI / 2)

func face_northwest():
	rotate_to_angle(7 * PI / 4)