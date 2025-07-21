class_name WindParticles
extends GPUParticles2D

@export var base_speed: float = 50.0
@export var speed_multiplier: float = 2.0
@export var wind_direction: Vector2 = Vector2(1, 0)

var ship_velocity: Vector2 = Vector2.ZERO
var is_ship_moving: bool = false

func _ready():
	setup_wind_particles()

func setup_wind_particles():
	# Create particle material
	var material = ParticleProcessMaterial.new()
	
	# Basic particle settings
	material.direction = Vector3(wind_direction.x, wind_direction.y, 0)
	material.initial_velocity_min = 20.0
	material.initial_velocity_max = 40.0
	material.gravity = Vector3.ZERO
	
	# Particle appearance - visible but not overwhelming
	material.scale_min = 0.4
	material.scale_max = 0.8
	
	# Brighter wind colors
	var gradient = Gradient.new()
	gradient.add_point(0.0, Color(0.7, 0.9, 1.0, 0.8))   # Bright cyan-white
	gradient.add_point(0.5, Color(0.6, 0.8, 0.95, 0.5))  # Medium fade
	gradient.add_point(1.0, Color(0.5, 0.7, 0.9, 0.0))   # Transparent
	
	var gradient_texture = GradientTexture1D.new()
	gradient_texture.gradient = gradient
	material.color_ramp = gradient_texture
	
	# Lifetime and emission - more visible particles
	amount = 25
	lifetime = 1.5
	
	# Emit from a small area at the back of the ship
	material.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	material.emission_box_extents = Vector3(8, 4, 0)  # Much smaller emission area
	
	# Apply material
	process_material = material
	
	# Set texture (simple white circle)
	texture = create_particle_texture()
	
	# Start with particles off
	emitting = false

func create_particle_texture() -> ImageTexture:
	"""Create a visible wind particle texture"""
	var size = 6  # Bigger for visibility
	var image = Image.create(size, size, false, Image.FORMAT_RGBA8)
	
	# Create a bright dot pattern for wind
	for x in range(size):
		for y in range(size):
			var center_dist = Vector2(x - size/2, y - size/2).length()
			if center_dist < size/2:
				var alpha = 1.0 - (center_dist / (size/2))
				alpha = alpha * 0.9  # Much more visible
				image.set_pixel(x, y, Color(1, 1, 1, alpha))
			else:
				image.set_pixel(x, y, Color.TRANSPARENT)
	
	var texture = ImageTexture.new()
	texture.set_image(image)
	return texture

func update_ship_movement(velocity: Vector2, moving: bool):
	"""Update particle system based on ship movement"""
	ship_velocity = velocity
	is_ship_moving = moving
	
	if moving:
		start_wind_effect()
		update_wind_direction()
	else:
		stop_wind_effect()

func start_wind_effect():
	"""Start the wind particle effect"""
	emitting = true

func stop_wind_effect():
	"""Stop the wind particle effect"""
	emitting = false

func update_wind_direction():
	"""Update wind direction based on ship movement"""
	if ship_velocity.length() > 0:
		# Wind comes from behind the ship (opposite to movement direction)
		var movement_direction = ship_velocity.normalized()
		wind_direction = -movement_direction
		
		# Update particle material
		if process_material is ParticleProcessMaterial:
			var material = process_material as ParticleProcessMaterial
			material.direction = Vector3(wind_direction.x, wind_direction.y, 0)
			
			# Increase particle speed based on ship speed
			var speed_factor = 1.0 + (ship_velocity.length() / 100.0) * speed_multiplier
			material.initial_velocity_min = base_speed * speed_factor
			material.initial_velocity_max = base_speed * speed_factor * 1.5

func set_wind_intensity(intensity: float):
	"""Set wind particle intensity (0.0 to 1.0)"""
	intensity = clamp(intensity, 0.0, 1.0)
	
	# Update particle amount and lifetime - more visible
	amount = int(25.0 * intensity)
	lifetime = 1.2 + intensity * 0.8
