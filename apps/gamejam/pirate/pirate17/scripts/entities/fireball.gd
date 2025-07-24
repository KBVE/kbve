class_name Fireball
extends Node2D

# Fireball properties
var velocity: Vector2 = Vector2.ZERO
var damage: int = 1
var owner_entity: Node2D  # Who shot this fireball
var target_entity: Node2D  # Who this fireball is aimed at
var lifetime: float = 5.0  # Max lifetime in seconds
var has_hit: bool = false

# Visual components
var sprite: Sprite2D
var particles: CPUParticles2D
var trail_particles: CPUParticles2D

# Collision detection
var collision_radius: float = 8.0
var check_interval: float = 0.05  # Check collisions every 0.05 seconds
var collision_timer: float = 0.0

func _ready():
	z_index = 15  # Above most entities
	create_visual()
	create_particles()

func create_visual():
	# Create fireball sprite
	sprite = Sprite2D.new()
	
	# Create a simple fireball using a colored circle
	var image = Image.create(16, 16, false, Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	
	# Draw a fiery circle
	var center = Vector2(8, 8)
	for x in range(16):
		for y in range(16):
			var pos = Vector2(x, y)
			var distance = pos.distance_to(center)
			if distance <= 8:
				var intensity = 1.0 - (distance / 8.0)
				var color = Color(1.0, 0.7 * intensity, 0.1 * intensity, intensity)
				image.set_pixel(x, y, color)
	
	var texture = ImageTexture.create_from_image(image)
	sprite.texture = texture
	sprite.scale = Vector2(1.5, 1.5)  # Make it bigger
	add_child(sprite)

func create_particles():
	# Create main fire particles
	particles = CPUParticles2D.new()
	particles.amount = 20
	particles.lifetime = 0.5
	particles.speed_scale = 2.0
	particles.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	particles.spread = 10.0
	particles.initial_velocity_min = 10.0
	particles.initial_velocity_max = 30.0
	particles.angular_velocity_min = -180.0
	particles.angular_velocity_max = 180.0
	particles.scale_amount_min = 0.5
	particles.scale_amount_max = 1.5
	particles.color = Color(1.0, 0.6, 0.1, 1.0)
	add_child(particles)
	
	# Create trail particles
	trail_particles = CPUParticles2D.new()
	trail_particles.amount = 30
	trail_particles.lifetime = 0.8
	trail_particles.speed_scale = 1.0
	trail_particles.emission_shape = CPUParticles2D.EMISSION_SHAPE_POINT
	trail_particles.spread = 5.0
	trail_particles.initial_velocity_min = -20.0
	trail_particles.initial_velocity_max = -5.0
	trail_particles.scale_amount_min = 0.3
	trail_particles.scale_amount_max = 0.8
	trail_particles.color = Color(1.0, 0.5, 0.0, 0.8)
	# Set gravity to make trail fall behind
	trail_particles.gravity = Vector2(0, 50)
	add_child(trail_particles)

func set_target(target_pos: Vector2, speed: float):
	var direction = (target_pos - position).normalized()
	velocity = direction * speed
	
	# Ensure visuals are created if they don't exist yet
	if not sprite:
		create_visual()
	if not particles:
		create_particles()
	
	# Rotate sprite to face direction - add safety check
	if sprite and is_instance_valid(sprite):
		sprite.rotation = atan2(direction.y, direction.x)
	else:
		print("WARNING: Fireball sprite is still null after recreation attempt")
	
	# Adjust particle directions
	if particles:
		particles.direction = -direction
	if trail_particles:
		trail_particles.direction = -direction

func _process(delta):
	# Move the fireball
	position += velocity * delta
	
	# Update lifetime
	lifetime -= delta
	if lifetime <= 0:
		explode_and_destroy()
		return
	
	# Check for collisions
	collision_timer += delta
	if collision_timer >= check_interval:
		collision_timer = 0.0
		check_collisions()
	
	# Check if out of bounds
	if position.x < -100 or position.x > 4000 or position.y < -100 or position.y > 4000:
		queue_free()

func check_collisions():
	if has_hit:
		return
	
	var main_scene = get_tree().current_scene
	if not main_scene:
		return
	
	# Check collision with player
	var player = main_scene.get_node_or_null("Player")
	if player:
		var distance_to_player = position.distance_to(player.position)
		if distance_to_player <= collision_radius + 16:  # 16 is approx player radius
			hit_entity(player)
			return
	
	# Check collision with NPCs
	var world = get_node("/root/Main/World")
	if world:
		var npcs = world.get_npcs()
		for npc in npcs:
			if npc and is_instance_valid(npc) and npc != owner_entity:
				var distance_to_npc = position.distance_to(npc.position)
				if distance_to_npc <= collision_radius + 20:  # 20 is approx NPC radius
					hit_entity(npc)
					return

func hit_entity(entity: Node2D):
	if has_hit:
		return
	
	has_hit = true
	
	# Deal damage based on entity type
	if entity.get_script() and entity.get_script().get_global_name() == "NPC":
		# Hit an NPC (enemy ship)
		entity.take_damage(damage)
		print("Dragon fireball hit enemy ship for ", damage, " damage!")
	else:
		# Hit player
		if Global.player and Global.player.stats:
			Global.player.stats.damage(damage)
			print("Dragon fireball hit player for ", damage, " damage!")
			print("Player health: ", Global.player.stats.health, "/", Global.player.stats.max_health)
	
	# Create impact effect
	create_impact_effect()
	
	# Destroy fireball
	queue_free()

func create_impact_effect():
	# Create explosion particles
	var explosion = CPUParticles2D.new()
	explosion.amount = 50
	explosion.lifetime = 0.5
	explosion.one_shot = true
	explosion.emitting = true
	explosion.speed_scale = 2.0
	explosion.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
	explosion.spread = 45.0
	explosion.initial_velocity_min = 50.0
	explosion.initial_velocity_max = 150.0
	explosion.scale_amount_min = 0.5
	explosion.scale_amount_max = 2.0
	explosion.color = Color(1.0, 0.4, 0.1, 1.0)
	
	# Add to parent (projectile container)
	get_parent().add_child(explosion)
	explosion.position = position
	
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

func explode_and_destroy():
	create_impact_effect()
	queue_free()
