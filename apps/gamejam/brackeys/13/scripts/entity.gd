extends Node2D

const ASTEROID_SCENE = preload("res://scenes/asteroid.tscn")

var asteroid_pool: Array = []
var active_asteroids: Array = []
var max_asteroids := int(Global.get_environment_data("asteroids"))
var spawn_timer: Timer


func _ready():
	spawn_timer = Timer.new()
	spawn_timer.wait_time = 2.0
	spawn_timer.one_shot = false
	add_child(spawn_timer)
	spawn_timer.connect("timeout", Callable(self, "_spawn_asteroid"))
	spawn_timer.start()
	initialize_pool(max_asteroids)

func initialize_pool(size: int):
	for i in range(size):
		var asteroid = ASTEROID_SCENE.instantiate()
		asteroid.connect("tree_exited", Callable(self, "_on_asteroid_destroyed").bind(asteroid))
		asteroid.visible = false
		asteroid_pool.append(asteroid)
		add_child(asteroid)

func _spawn_asteroid():
	if asteroid_pool.size() > 0:
		var asteroid = asteroid_pool.pop_back()
		var screen_size = get_viewport().get_visible_rect().size
		asteroid.global_position = Vector2(randf_range(0, screen_size.x), randf_range(0, screen_size.y))
		asteroid.visible = true
		active_asteroids.append(asteroid)
	else:
		#Global.emit_signal("notification_received", "asteroids_gone", "Radar says no asteroids", "info")
		print("No asteroids available in pool!")

func _on_asteroid_destroyed(asteroid):
	asteroid.visible = false
	asteroid.global_position = Vector2(-1000, -1000)
	active_asteroids.erase(asteroid)
	asteroid_pool.append(asteroid)
