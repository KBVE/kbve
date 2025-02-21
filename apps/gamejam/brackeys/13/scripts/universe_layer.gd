extends Parallax2D


@export var pool_size: int = 2
@export var scroll_speed: float = 10.0

# Screen bounds
var screen_width: float
var screen_height: float

# Sprite pools
var active_sprites: Array[Sprite2D] = []
var inactive_sprites: Array[Sprite2D] = []

const BASE_PATH: String = "res://assets/kbve/png/universe/object"

func _ready():
	var viewport = get_viewport()
	screen_width = viewport.get_visible_rect().size.x
	screen_height = viewport.get_visible_rect().size.y
	ignore_camera_scroll = true
	repeat_size = Vector2(screen_width * 2, screen_height * 2)
	scroll_scale = Vector2(1.0, 1.0)
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
		var notifier = VisibleOnScreenNotifier2D.new()
		notifier.rect = Rect2(-sprite.get_rect().size * scale / 2, sprite.get_rect().size * scale)
		sprite.add_child(notifier)
		notifier.connect("screen_exited", Callable(self, "_return_to_pool").bind(sprite))
		inactive_sprites.append(sprite)
		add_child(sprite)
		sprite.hide()

func _spawn_initial_sprites():
	var spawn_area_width = screen_width * 2
	for i in range(pool_size):
		_spawn_sprite(Vector2(randf_range(0, spawn_area_width), randf_range(0, screen_height)))

func _spawn_sprite(position: Vector2):
	if inactive_sprites.size() == 0:
		return
	
	var sprite = inactive_sprites.pop_back()
	sprite.position = position
	sprite.scale = Vector2(randf_range(0.5, 1.5), randf_range(0.5, 1.5))
	sprite.show()
	active_sprites.append(sprite)

func _return_to_pool(sprite: Sprite2D):
	if sprite in active_sprites:
		active_sprites.erase(sprite)
		inactive_sprites.append(sprite)
		sprite.hide()
		var spawn_x = screen_width + scroll_offset.x + randf_range(0, screen_width)
		_spawn_sprite(Vector2(spawn_x, randf_range(0, screen_height)))

func _process(delta: float):
	scroll_offset.x -= scroll_speed * delta
