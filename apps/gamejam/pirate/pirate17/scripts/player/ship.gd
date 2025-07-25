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
	sprite = get_node("Sprite2D")
	if sprite:
		sprite.z_index = 5
	
	var ship_shadow = preload("res://scripts/ship_shadow.gd").new()
	ship_shadow.shadow_offset = Vector2(12, 12)
	ship_shadow.shadow_scale = 0.7
	add_child(ship_shadow)
	move_child(ship_shadow, 0)

func setup_wind_particles():
	wind_particles = WindParticles.new()
	wind_particles.position = Vector2(0, 15)
	wind_particles.z_index = 2
	add_child(wind_particles)

func update_wind_effects(velocity: Vector2, moving: bool):
	if wind_particles:
		wind_particles.update_ship_movement(velocity, moving)

func update_direction_from_movement(from: Vector2i, to: Vector2i):
	var movement_vector = to - from
	
	if movement_vector == Vector2i.ZERO:
		return
	
	var angle = atan2(movement_vector.y, movement_vector.x)
	
	var target_angle = angle + PI / 2
	
	rotate_to_angle_smooth(target_angle)

func rotate_to_angle(target_angle: float):
	if sprite:
		sprite.rotation = target_angle
		current_rotation = target_angle

func rotate_to_angle_smooth(target_angle: float, duration: float = 0.3):
	if not sprite:
		return
	
	if rotation_tween:
		rotation_tween.kill()
	
	var current_angle = sprite.rotation
	var angle_diff = target_angle - current_angle
	
	while angle_diff > PI:
		angle_diff -= 2 * PI
	while angle_diff < -PI:
		angle_diff += 2 * PI
	
	var final_angle = current_angle + angle_diff
	
	rotation_tween = create_tween()
	rotation_tween.set_ease(Tween.EASE_OUT)
	rotation_tween.set_trans(Tween.TRANS_CUBIC)
	
	is_rotating = true
	
	rotation_tween.tween_property(sprite, "rotation", final_angle, duration)
	rotation_tween.tween_callback(_on_rotation_complete)

func _on_rotation_complete():
	is_rotating = false
	current_rotation = sprite.rotation
	rotation_completed.emit()

func is_currently_rotating() -> bool:
	return is_rotating

func get_current_rotation() -> float:
	return current_rotation

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
