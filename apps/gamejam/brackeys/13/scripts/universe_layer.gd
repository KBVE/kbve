extends Parallax2D

@export var pool_size: int = 2
@export var despawn_distance: float = 2000

var active_sprites: Array[Sprite2D] = []
var inactive_sprites: Array[Sprite2D] = []

const BASE_PATH: String = "res://assets/kbve/png/universe/object"

var spaceship: Node2D

func _ready():
	spaceship = get_tree().get_root().find_child("Spaceship", true, false)
	_initialize_pool()
	_spawn_initial_sprites()

func _initialize_pool():
	for i in range(1, pool_size + 1):
		var sprite = Sprite2D.new()
		var texture_path = BASE_PATH + str(i) + ".png"
		if ResourceLoader.exists(texture_path):
			sprite.texture = load(texture_path) as Texture2D
		else:
			print("Warning: Texture not found at ", texture_path)
			continue
		
		var scale = randf_range(0.5, 1.5)
		sprite.scale = Vector2(scale, scale)
		inactive_sprites.append(sprite)
		add_child(sprite)
		sprite.hide()

func _spawn_initial_sprites():
	for i in range(pool_size):
		_spawn_sprite_near_ship()

func _spawn_sprite_near_ship():
	if inactive_sprites.is_empty() or spaceship == null:
		return
	
	var sprite = inactive_sprites.pop_back()
	
	var offset_distance = randf_range(500, 1500)
	var angle = randf_range(0, TAU)
	var spawn_position = spaceship.global_position + Vector2(offset_distance, 0).rotated(angle)

	sprite.position = spawn_position
	sprite.scale = Vector2(randf_range(0.5, 1.5), randf_range(0.5, 1.5))
	sprite.show()
	active_sprites.append(sprite)

func _process(delta: float):
	if spaceship == null:
		return
	
	for sprite in active_sprites.duplicate():
		if spaceship.global_position.distance_to(sprite.global_position) > despawn_distance:
			_return_to_pool(sprite)
	
	while active_sprites.size() < pool_size:
		_spawn_sprite_near_ship()

func _return_to_pool(sprite: Sprite2D):
	active_sprites.erase(sprite)
	inactive_sprites.append(sprite)
	sprite.hide()
