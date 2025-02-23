class_name Autorepair extends CharacterBody2D

@export var follow_distance: float = 100.0
@export var speed: float = 150.0
@export var rotation_speed: float = 5.0
@export var wander_radius: float = 30.0
@export var stop_threshold: float = 10.0 

var target_position: Vector2

func _ready():
	target_position = global_position

func _physics_process(delta: float) -> void:
	var starship_position_raw = Global.get_starship_data("coordinates")
	var starship_position: Vector2

	if starship_position_raw is String:
		var parsed = starship_position_raw.replace("(", "").replace(")", "").split(",")
		if parsed.size() == 2:
			starship_position = Vector2(parsed[0].to_float(), parsed[1].to_float())
		else:
			starship_position = Vector2.ZERO
	else:
		starship_position = starship_position_raw

	var direction = (starship_position - global_position).normalized()
	var offset = direction * follow_distance
	var random_offset = Vector2(randf_range(-wander_radius, wander_radius), randf_range(-wander_radius, wander_radius))
	target_position = starship_position - offset + random_offset

	if global_position.distance_to(target_position) <= stop_threshold:
		return

	var move_direction = (target_position - global_position).normalized()
	velocity = lerp(velocity, move_direction * speed, 0.1)

	rotation = lerp_angle(rotation, move_direction.angle(), rotation_speed * delta)

	move_and_slide()
