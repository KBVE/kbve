extends Node2D

const ASTEROID_SCENE = preload("res://scenes/asteroid.tscn")

var asteroid_pool: Array = []
var max_asteroids := int(Global.get_environment_data("asteroids"))
var spawn_timer: Timer
var spaceship: Node2D

func _ready():
	spaceship = get_tree().get_root().find_child("Spaceship", true, false)
	if not spaceship:
			print("Warning: Spaceship not found in the scene!")


func start_spawn():
	spawn_timer = Timer.new()
	spawn_timer.wait_time = 1.0
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
	if not spaceship:
		print("No spaceship reference, cannot spawn asteroids!")
		return

	for asteroid in asteroid_pool:
		if not asteroid.visible:
			var screen_size = get_viewport().get_visible_rect().size
			var screen_center = screen_size / 2
			var spawn_distance = max(screen_size.x, screen_size.y) * 0.6 

			var angle = randf_range(0, 2 * PI)
			var spawn_position = spaceship.global_position + Vector2.RIGHT.rotated(angle) * spawn_distance

			asteroid.movement_vector = (spaceship.global_position - spawn_position).normalized()

			asteroid.global_position = spawn_position
			asteroid.visible = true
			return

	print("No inactive asteroids available!")

func _on_asteroid_destroyed(asteroid):
	asteroid.visible = false
	if spaceship:
		asteroid.global_position = spaceship.global_position + Vector2(-1000, -1000)
	else:
		asteroid.global_position = Vector2(-1000, -1000)
	print("Asteroid returned to pool")

func _on_entity_destroyed(entity_type: String, entity_id: int, additional_data: Dictionary):
	if entity_type == "asteroid":
		var asteroid = instance_from_id(entity_id)
		if asteroid:
			_on_asteroid_destroyed(asteroid)
