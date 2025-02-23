extends Node2D

const EARTH_SCENE = preload("res://scenes/earth.tscn")

func _spawn_earth():
	var earth_instance = EARTH_SCENE.instantiate()
	earth_instance.position = Vector2(0, 0)
	add_child(earth_instance) 
