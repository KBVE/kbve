extends Node2D

const ASTEROID_SCENE = preload("res://scenes/asteroid.tscn")

var asteroid_pool: Array = []
var max_asteroids := int(Global.get_environment_data("asteroids"))
var spawn_timer: Timer

func start_spawn():
	spawn_timer = Timer.new()
	spawn_timer.wait_time = 2.0
	spawn_timer.one_shot = false
	add_child(spawn_timer)
	spawn_timer.connect("timeout", Callable(self, "_spawn_asteroid"))
	spawn_timer.start()
	Global.connect("entity_destroyed", Callable(self, "_on_entity_destroyed"))

func initialize_pool(size: int):
	for i in range(size):
		var asteroid = ASTEROID_SCENE.instantiate()
		asteroid.visible = false
		asteroid_pool.append(asteroid)
		add_child(asteroid)

func _spawn_asteroid():
	for asteroid in asteroid_pool:
		if not asteroid.visible:
			var screen_size = get_viewport().get_visible_rect().size
			var spawn_margin = 50

			var spawn_side = randi_range(0, 3)
			var spawn_position = Vector2()

			match spawn_side:
				0: spawn_position = Vector2(randf_range(0, screen_size.x), -spawn_margin)  # Top
				1: spawn_position = Vector2(randf_range(0, screen_size.x), screen_size.y + spawn_margin)  # Bottom
				2: spawn_position = Vector2(-spawn_margin, randf_range(0, screen_size.y))  # Left
				3: spawn_position = Vector2(screen_size.x + spawn_margin, randf_range(0, screen_size.y))  # Right

			var target_position = screen_size / 2.0 + Vector2(randf_range(-100, 100), randf_range(-100, 100))
			asteroid.movement_vector = (target_position - spawn_position).normalized()

			asteroid.global_position = spawn_position
			asteroid.visible = true
			return

	print("No inactive asteroids available!")

func _on_asteroid_destroyed(asteroid):
	asteroid.visible = false
	asteroid.global_position = Vector2(-1000, -1000)
	print("Asteroid returned to pool")

func _on_entity_destroyed(entity_type: String, entity_id: int, additional_data: Dictionary):
	if entity_type == "asteroid":
		var asteroid = instance_from_id(entity_id)
		if asteroid:
			_on_asteroid_destroyed(asteroid)
