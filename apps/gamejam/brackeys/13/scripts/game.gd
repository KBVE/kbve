extends Node2D

@onready var spaceship = $Spaceship
@onready var projectiles = $Projectiles
@onready var background = $Background
@onready var entity = $Entity
@onready var auto_save_timer = $AutoSaveTimer

const AUTO_SAVE_INTERVAL = 30.0

func _ready():
	spaceship.connect("laser_shot", _on_spaceship_laser_shot)
	projectiles.initialize_pool(int(Global.get_starship_stat("laser_ammo")))
	entity.initialize_pool(int(Global.get_environment_data("asteroids")))
	entity.start_spawn()
	Global.emit_signal("notification_received", "game_start", "Game Started! Ready for launch.", "info")
	if not Global.load_player_data():
		print("No save file found. Initializing new player data.")
		Global.emit_signal("notification_received", "no_save", "Creating new save file.", "warning")
		Global.save_player_data()
	else:
		projectiles.dynamic_pool_adjustment()
		Global.emit_signal("notification_received", "return_player", "Welcome back to Asteroids & Droids.", "info")

	auto_save_timer.wait_time = AUTO_SAVE_INTERVAL
	auto_save_timer.connect("timeout", _on_auto_save_timer_timeout)
	auto_save_timer.start()
		
func _on_spaceship_laser_shot(scope_position: Vector2, rotation: float):
	projectiles.shoot_laser(scope_position, rotation)


func _on_auto_save_timer_timeout():
	if Global.save_player_data():
		Global.emit_signal("notification_received", "saved_game", "Game process has been saved.", "success")
	else:
		Global.emit_signal("notification_received", "save_failed", "Failed to save game.", "error")
		print("Auto-save failed.")
