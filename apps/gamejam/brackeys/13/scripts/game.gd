extends Node2D

@onready var spaceship = $Spaceship
@onready var projectiles = $Projectiles
@onready var background = $Background

const LASER_POOL_SIZE = 25

func _ready():
	spaceship.connect("laser_shot", _on_spaceship_laser_shot)
	projectiles.initialize_pool(LASER_POOL_SIZE)

func _on_spaceship_laser_shot(scope_position: Vector2, rotation: float):
	projectiles.shoot_laser(scope_position, rotation)
