class_name Fireball
extends Node2D

# Fireball properties
var velocity: Vector2 = Vector2.ZERO
var damage: int = 1
var owner_entity: Node2D  # Who shot this fireball
var target_entity: Node2D  # Who this fireball is aimed at
var lifetime: float = 5.0  # Max lifetime in seconds
var has_hit: bool = false
var is_active: bool = false

# Visual components (will be assigned from scene)
@onready var hit_area: Area2D = $HitArea

# Particle systems for visual effect
var main_particles: CPUParticles2D
var trail_particles: CPUParticles2D
var core_particles: CPUParticles2D

# Collision detection
var collision_radius: float = 12.0

func _ready():
	z_index = 15  # Above most entities
	create_particles()
	reset_fireball()
	
	# Connect area collision signals
	if hit_area:
		hit_area.area_entered.connect(_on_hit_area_entered)
		hit_area.body_entered.connect(_on_hit_body_entered)

func create_particles():
	# Create bright core particles (intense white/yellow center)
	core_particles = CPUParticles2D.new()
	core_particles.amount = 30
	core_particles.lifetime = 0.4
	core_particles.speed_scale = 2.0
	core_particles.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	core_particles.emission_sphere_radius = 2.0
	core_particles.spread = 360.0
	core_particles.initial_velocity_min = 20.0
	core_particles.initial_velocity_max = 40.0
	core_particles.scale_amount_min = 1.2
	core_particles.scale_amount_max = 2.0
	core_particles.color = Color(1.0, 1.0, 0.9, 1.0)  # Bright white-yellow
	core_particles.color_ramp = create_fire_gradient()
	add_child(core_particles)
	
	# Create main fire particles (vibrant orange/red flames)
	main_particles = CPUParticles2D.new()
	main_particles.amount = 40
	main_particles.lifetime = 0.6
	main_particles.speed_scale = 1.8
	main_particles.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	main_particles.emission_sphere_radius = 6.0
	main_particles.spread = 30.0
	main_particles.initial_velocity_min = 15.0
	main_particles.initial_velocity_max = 35.0
	main_particles.angular_velocity_min = -270.0
	main_particles.angular_velocity_max = 270.0
	main_particles.scale_amount_min = 0.8
	main_particles.scale_amount_max = 1.5
	main_particles.color = Color(1.0, 0.6, 0.2, 1.0)  # Vibrant orange
	main_particles.color_ramp = create_flame_gradient()
	add_child(main_particles)
	
	# Create trailing smoke/embers with better physics
	trail_particles = CPUParticles2D.new()
	trail_particles.amount = 25
	trail_particles.lifetime = 1.2
	trail_particles.speed_scale = 1.0
	trail_particles.emission_shape = CPUParticles2D.EMISSION_SHAPE_POINT
	trail_particles.spread = 15.0
	trail_particles.initial_velocity_min = -25.0
	trail_particles.initial_velocity_max = -10.0
	trail_particles.scale_amount_min = 0.4
	trail_particles.scale_amount_max = 0.8
	trail_particles.color = Color(1.0, 0.4, 0.1, 0.8)  # Bright ember orange
	trail_particles.color_ramp = create_ember_gradient()
	trail_particles.gravity = Vector2(0, 20)
	trail_particles.tangential_accel_min = -30.0
	trail_particles.tangential_accel_max = 30.0
	add_child(trail_particles)

func create_fire_gradient() -> Gradient:
	var gradient = Gradient.new()
	gradient.add_point(0.0, Color(1.0, 1.0, 0.9, 1.0))  # Bright white-yellow
	gradient.add_point(0.3, Color(1.0, 0.8, 0.3, 1.0))  # Yellow-orange
	gradient.add_point(0.7, Color(1.0, 0.4, 0.1, 0.8))  # Orange-red
	gradient.add_point(1.0, Color(0.8, 0.2, 0.1, 0.3))  # Dark red fade
	return gradient

func create_flame_gradient() -> Gradient:
	var gradient = Gradient.new()
	gradient.add_point(0.0, Color(1.0, 0.6, 0.2, 1.0))  # Vibrant orange
	gradient.add_point(0.4, Color(1.0, 0.3, 0.1, 0.9))  # Red-orange
	gradient.add_point(0.8, Color(0.8, 0.2, 0.1, 0.6))  # Dark red
	gradient.add_point(1.0, Color(0.4, 0.1, 0.05, 0.2)) # Almost black fade
	return gradient

func create_ember_gradient() -> Gradient:
	var gradient = Gradient.new()
	gradient.add_point(0.0, Color(1.0, 0.4, 0.1, 0.8))  # Bright ember
	gradient.add_point(0.5, Color(0.8, 0.3, 0.1, 0.5))  # Dimming ember
	gradient.add_point(1.0, Color(0.3, 0.1, 0.05, 0.1)) # Smoke fade
	return gradient

func create_explosion_gradient() -> Gradient:
	var gradient = Gradient.new()
	gradient.add_point(0.0, Color(1.0, 1.0, 0.9, 1.0))  # Bright white flash
	gradient.add_point(0.2, Color(1.0, 0.8, 0.3, 1.0))  # Yellow explosion
	gradient.add_point(0.5, Color(1.0, 0.4, 0.1, 0.8))  # Orange blast
	gradient.add_point(0.8, Color(0.6, 0.2, 0.1, 0.4))  # Red dissipation
	gradient.add_point(1.0, Color(0.2, 0.1, 0.05, 0.1)) # Smoke fade
	return gradient

func reset_fireball():
	"""Reset fireball to inactive state for pooling"""
	is_active = false
	has_hit = false
	velocity = Vector2.ZERO
	lifetime = 5.0
	owner_entity = null
	target_entity = null
	visible = false
	
	# Reset all particle systems
	if core_particles:
		core_particles.emitting = false
	if main_particles:
		main_particles.emitting = false
	if trail_particles:
		trail_particles.emitting = false

func launch(start_pos: Vector2, target_pos: Vector2, speed: float, damage_amount: int = 1, fireball_owner: Node2D = null):
	"""Launch fireball from start to target position"""
	if is_active:
		return false  # Fireball already in use
	
	is_active = true
	has_hit = false
	visible = true
	position = start_pos
	damage = damage_amount
	owner_entity = fireball_owner
	
	# Calculate direction and velocity
	var direction = (target_pos - start_pos).normalized()
	velocity = direction * speed
	
	# Start all particle systems
	if core_particles:
		core_particles.direction = -direction
		core_particles.emitting = true
	if main_particles:
		main_particles.direction = -direction
		main_particles.emitting = true
	if trail_particles:
		trail_particles.direction = -direction
		trail_particles.emitting = true
	
	return true

func _process(delta):
	if not is_active:
		return
	
	# Move the fireball
	position += velocity * delta
	
	# Update lifetime
	lifetime -= delta
	if lifetime <= 0:
		deactivate_fireball()
		return
	
	# Check if out of bounds
	if position.x < -100 or position.x > 4100 or position.y < -100 or position.y > 4100:
		deactivate_fireball()

func _on_hit_area_entered(area: Area2D):
	"""Called when the fireball's hit area enters another Area2D"""
	if has_hit or not is_active:
		return
	
	print("🔥 FIREBALL HIT AREA: ", area.name, " (parent: ", area.get_parent().name, ")")
	print("🔥 Area collision layer: ", area.collision_layer, " mask: ", area.collision_mask)
	print("🔥 Fireball collision layer: ", hit_area.collision_layer, " mask: ", hit_area.collision_mask)
	
	# Get the parent node which should be the entity
	var entity = area.get_parent()
	if entity and entity != owner_entity:
		print("DEBUG: Fireball hit area collision with: ", entity.name)
		if entity.has_method("take_damage"):
			hit_entity(entity)

func _on_hit_body_entered(body: Node2D):
	"""Called when the fireball's hit area enters a physics body"""
	if has_hit or not is_active:
		return
	
	# Handle collision with physics bodies if needed
	if body and body != owner_entity:
		print("DEBUG: Fireball hit body collision with: ", body.name)
		if body.has_method("take_damage"):
			hit_entity(body)

func hit_entity(entity: Node2D):
	if has_hit or not is_active:
		return
	
	has_hit = true
	
	# Check if entity can take damage
	if entity.has_method("take_damage"):
		entity.take_damage(damage)
		print("Dragon fireball hit ", entity.name, " for ", damage, " damage!")
	elif entity == get_tree().current_scene.get_node_or_null("Player"):
		# Hit player - use Global.player.stats
		if Global.player and Global.player.stats:
			Global.player.stats.damage(damage)
			print("Dragon fireball hit player for ", damage, " damage!")
			print("Player health: ", Global.player.stats.health, "/", Global.player.stats.max_health)
	
	# Create impact effect
	create_impact_effect()
	
	# Deactivate fireball
	deactivate_fireball()

func create_impact_effect():
	# Create explosion particles with enhanced visuals
	var explosion = CPUParticles2D.new()
	explosion.amount = 80
	explosion.lifetime = 0.8
	explosion.one_shot = true
	explosion.emitting = true
	explosion.speed_scale = 3.0
	explosion.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	explosion.spread = 45.0
	explosion.initial_velocity_min = 80.0
	explosion.initial_velocity_max = 200.0
	explosion.scale_amount_min = 0.8
	explosion.scale_amount_max = 3.0
	explosion.angular_velocity_min = -360.0
	explosion.angular_velocity_max = 360.0
	explosion.color = Color(1.0, 0.8, 0.3, 1.0)  # Brighter explosion
	explosion.color_ramp = create_explosion_gradient()
	
	# Add to parent (world or scene)
	var world = get_tree().current_scene
	if world:
		world.add_child(explosion)
		explosion.position = global_position
	
	# Clean up explosion after it's done
	var cleanup_timer = Timer.new()
	cleanup_timer.wait_time = 1.0
	cleanup_timer.one_shot = true
	cleanup_timer.timeout.connect(func(): 
		explosion.queue_free()
		cleanup_timer.queue_free()
	)
	explosion.add_child(cleanup_timer)
	cleanup_timer.start()

func deactivate_fireball():
	"""Deactivate fireball and return it to the pool"""
	reset_fireball()
	
	# Notify pool that this fireball is available
	var fireball_pool = get_node_or_null("/root/Main/FireballPool")
	if not fireball_pool:
		# Try alternative path
		fireball_pool = get_tree().current_scene.get_node_or_null("FireballPool")
	if fireball_pool:
		fireball_pool.return_fireball(self)
