class_name ParallaxBackground
extends ParallaxBackground

@export var cloud_speed: float = 20.0
@export var mist_speed: float = 15.0
@export var wind_speed: float = 30.0

var cloud_layer: ParallaxLayer
var mist_layer: ParallaxLayer
var wind_streak_layer: ParallaxLayer

func _ready():
	setup_parallax_layers()

func setup_parallax_layers():
	"""Setup multiple parallax layers for atmospheric effects"""
	create_cloud_layer()
	create_mist_layer()
	create_wind_streak_layer()

func create_cloud_layer():
	"""Create slow-moving cloud layer"""
	cloud_layer = ParallaxLayer.new()
	cloud_layer.motion_scale = Vector2(0.1, 0.1)  # Slow parallax movement
	cloud_layer.motion_mirroring = Vector2(2048, 2048)  # Repeat pattern
	
	var cloud_sprite = create_atmospheric_texture("clouds", Color(0.9, 0.9, 1.0, 0.3))
	cloud_layer.add_child(cloud_sprite)
	add_child(cloud_layer)

func create_mist_layer():
	"""Create medium-speed mist layer"""
	mist_layer = ParallaxLayer.new()
	mist_layer.motion_scale = Vector2(0.3, 0.3)  # Medium parallax movement
	mist_layer.motion_mirroring = Vector2(1024, 1024)
	
	var mist_sprite = create_atmospheric_texture("mist", Color(0.8, 0.9, 1.0, 0.2))
	mist_layer.add_child(mist_sprite)
	add_child(mist_layer)

func create_wind_streak_layer():
	"""Create fast-moving wind streak layer"""
	wind_streak_layer = ParallaxLayer.new()
	wind_streak_layer.motion_scale = Vector2(0.5, 0.5)  # Faster parallax movement
	wind_streak_layer.motion_mirroring = Vector2(512, 512)
	
	var wind_sprite = create_wind_streaks()
	wind_streak_layer.add_child(wind_sprite)
	add_child(wind_streak_layer)

func create_atmospheric_texture(type: String, color: Color) -> Sprite2D:
	"""Create atmospheric texture sprite"""
	var sprite = Sprite2D.new()
	sprite.texture = generate_atmospheric_texture(type, color)
	sprite.position = Vector2.ZERO
	return sprite

func create_wind_streaks() -> Node2D:
	"""Create wind streak effects"""
	var container = Node2D.new()
	
	# Create multiple wind streaks at different positions
	for i in range(20):
		var streak = Line2D.new()
		streak.width = randf_range(1.0, 3.0)
		streak.default_color = Color(0.7, 0.8, 0.9, randf_range(0.1, 0.3))
		
		# Create random wind streak lines
		var start_pos = Vector2(randf_range(-500, 500), randf_range(-500, 500))
		var length = randf_range(50, 150)
		var angle = randf() * 2 * PI
		var end_pos = start_pos + Vector2(cos(angle), sin(angle)) * length
		
		streak.add_point(start_pos)
		streak.add_point(end_pos)
		
		container.add_child(streak)
	
	return container

func generate_atmospheric_texture(type: String, color: Color) -> ImageTexture:
	"""Generate procedural atmospheric textures"""
	var size = 512
	var image = Image.create(size, size, false, Image.FORMAT_RGBA8)
	
	match type:
		"clouds":
			generate_cloud_pattern(image, size, color)
		"mist":
			generate_mist_pattern(image, size, color)
		_:
			generate_noise_pattern(image, size, color)
	
	var texture = ImageTexture.new()
	texture.set_image(image)
	return texture

func generate_cloud_pattern(image: Image, size: int, color: Color):
	"""Generate cloud-like pattern"""
	var noise = FastNoiseLite.new()
	noise.seed = randi()
	noise.noise_type = FastNoiseLite.TYPE_PERLIN
	noise.frequency = 0.01
	
	for x in range(size):
		for y in range(size):
			var noise_value = noise.get_noise_2d(x, y)
			var alpha = (noise_value + 1.0) / 2.0  # Normalize to 0-1
			alpha = pow(alpha, 2.0)  # Make clouds more sparse
			
			var final_color = Color(color.r, color.g, color.b, alpha * color.a)
			image.set_pixel(x, y, final_color)

func generate_mist_pattern(image: Image, size: int, color: Color):
	"""Generate mist-like pattern"""
	var noise = FastNoiseLite.new()
	noise.seed = randi()
	noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	noise.frequency = 0.02
	
	for x in range(size):
		for y in range(size):
			var noise_value = noise.get_noise_2d(x, y)
			var alpha = (noise_value + 1.0) / 2.0
			alpha = smoothstep(0.3, 0.7, alpha)  # Softer transitions
			
			var final_color = Color(color.r, color.g, color.b, alpha * color.a)
			image.set_pixel(x, y, final_color)

func generate_noise_pattern(image: Image, size: int, color: Color):
	"""Generate basic noise pattern"""
	for x in range(size):
		for y in range(size):
			var alpha = randf() * color.a
			var final_color = Color(color.r, color.g, color.b, alpha)
			image.set_pixel(x, y, final_color)

func update_parallax_offset(camera_position: Vector2):
	"""Update parallax offset based on camera movement"""
	scroll_offset = camera_position

func set_wind_direction(direction: Vector2):
	"""Update wind direction for all layers"""
	if wind_streak_layer:
		# Rotate wind streaks based on wind direction
		wind_streak_layer.rotation = atan2(direction.y, direction.x)

func set_movement_intensity(intensity: float):
	"""Adjust parallax intensity based on movement speed"""
	intensity = clamp(intensity, 0.0, 2.0)
	
	if cloud_layer:
		cloud_layer.motion_scale = Vector2(0.1, 0.1) * intensity
	if mist_layer:
		mist_layer.motion_scale = Vector2(0.3, 0.3) * intensity
	if wind_streak_layer:
		wind_streak_layer.motion_scale = Vector2(0.5, 0.5) * intensity