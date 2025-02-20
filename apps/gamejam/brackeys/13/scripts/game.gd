extends Node2D

@onready var spaceship = $Spaceship
@onready var projectiles = $Projectiles
@onready var background = $Background
#@onready var tm = $ToastManager

const LASER_POOL_SIZE = 10

func _ready():
	spaceship.connect("laser_shot", _on_spaceship_laser_shot)
	projectiles.initialize_pool(LASER_POOL_SIZE)
	Global.emit_signal("notification_received", "game_start", "Game Started! Ready for launch.", "info")

func _on_spaceship_laser_shot(scope_position: Vector2, rotation: float):
	projectiles.shoot_laser(scope_position, rotation)
