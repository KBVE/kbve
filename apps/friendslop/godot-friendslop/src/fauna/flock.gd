class_name Flock
extends Node3D

@export var species: BirdSpecies
@export var count := 3
@export var player_path: NodePath
@export var radius_step := 1.5
@export var height_step := 0.8
@export var speed_step := 0.12


func _ready() -> void:
	add_to_group("flocks")
	var player := get_node_or_null(player_path) as Node3D
	if not player or not species:
		return
	for i in count:
		var s: BirdSpecies = species.duplicate()
		s.orbit_radius += float(i) * radius_step
		s.orbit_height += float(i) * height_step
		s.orbit_speed += float(i) * speed_step
		var bird := Bird.new()
		bird.species = s
		bird.phase = TAU * float(i) / float(count)
		add_child(bird)
		bird.target_path = bird.get_path_to(player)
		bird.global_position = player.global_position + Vector3(cos(bird.phase) * s.orbit_radius, s.orbit_height, sin(bird.phase) * s.orbit_radius)
