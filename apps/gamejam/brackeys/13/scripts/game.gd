extends Node2D

@onready var spaceship = $Spaceship
@onready var projectiles = $Projectiles

func _ready():
	spaceship.connect("laser_shot", _on_spaceship_laser_shot)
	
func _on_spaceship_laser_shot(laser):
	projectiles.add_child(laser)
