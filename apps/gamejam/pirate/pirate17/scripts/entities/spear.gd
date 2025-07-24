class_name Spear
extends Node2D

# Spear properties
var velocity: Vector2 = Vector2.ZERO
var damage: int = 2
var owner_entity: Node2D  # Who shot this spear
var target_entity: Node2D  # Who this spear is aimed at
var lifetime: float = 4.0  # Max lifetime in seconds
var has_hit: bool = false
var is_active: bool = false

# Visual components (will be assigned from scene)
@onready var sprite: Sprite2D = $SpearSprite
@onready var glow_sprite: Sprite2D = $GlowSprite  
@onready var debug_tip_indicator: Node2D = $DebugTip
@onready var hit_area: Area2D = $HitArea

# Collision detection
var collision_radius: float = 16.0  # Increased radius for better hit detection
var check_interval: float = 0.02  # Check collisions every 0.02 seconds
var collision_timer: float = 0.0
var tip_offset: float = 16.0  # Distance from wooden end to tip (adjusted for better alignment)
var spear_scale: float = 0.25  # Scale factor for the spear sprites (made smaller)

func _ready():
	z_index = 12  # Above most entities but below UI
	apply_spear_scale()
	reset_spear()
	
	# Connect area collision signals
	if hit_area:
		hit_area.area_entered.connect(_on_hit_area_entered)
		hit_area.body_entered.connect(_on_hit_body_entered)

func apply_spear_scale():
	"""Apply consistent scaling to spear sprites"""
	if sprite:
		sprite.scale = Vector2(spear_scale, spear_scale)
	if glow_sprite:
		glow_sprite.scale = Vector2(spear_scale * 1.2, spear_scale * 1.2)  # Slightly larger glow

func get_collision_tip_offset() -> Vector2:
	"""Get the current tip offset vector for collision detection - used by debug indicator"""
	if velocity == Vector2.ZERO:
		# If not moving, point right by default
		return Vector2(tip_offset, 0)
	else:
		# Calculate based on current movement direction
		var direction = velocity.normalized()
		return direction * tip_offset


func reset_spear():
	"""Reset spear to inactive state for pooling"""
	is_active = false
	has_hit = false
	velocity = Vector2.ZERO
	lifetime = 4.0
	collision_timer = 0.0
	owner_entity = null
	target_entity = null
	visible = false

func launch(start_pos: Vector2, target_pos: Vector2, speed: float, damage_amount: int = 2, owner: Node2D = null):
	"""Launch spear from start to target position"""
	if is_active:
		return false  # Spear already in use
	
	is_active = true
	has_hit = false
	visible = true
	position = start_pos
	damage = damage_amount
	owner_entity = owner
	
	# Calculate direction and velocity
	var direction = (target_pos - start_pos).normalized()
	velocity = direction * speed
	
	# Rotate sprite to face direction
	if sprite:
		# Calculate base angle from direction
		var base_angle = atan2(direction.y, direction.x)
		
		# Try different rotation offsets - most spear sprites point up by default
		# So we need to rotate by PI/2 to make "up" point to the right (0 degrees)
		var angle = base_angle + PI/2
		
		sprite.rotation = angle
		if glow_sprite:
			glow_sprite.rotation = angle
		
		# Debug print to help identify correct rotation
		print("Spear launched: base_angle=", rad_to_deg(base_angle), "° final_angle=", rad_to_deg(angle), "°")
	
	return true

func _process(delta):
	if not is_active:
		return
	
	# Move the spear
	position += velocity * delta
	
	# Update hit area position to follow the tip
	if hit_area and velocity.length() > 0:
		var direction = velocity.normalized()
		hit_area.position = direction * tip_offset
	
	# Update lifetime
	lifetime -= delta
	if lifetime <= 0:
		deactivate_spear()
		return
	
	# Check if out of bounds
	if position.x < -200 or position.x > 4200 or position.y < -200 or position.y > 4200:
		deactivate_spear()

func check_collisions():
	if has_hit or not is_active:
		return
	
	# Calculate tip position using the same method as the debug indicator
	# This ensures collision detection matches the visual debug point
	var direction = velocity.normalized()
	var tip_position = position + direction * tip_offset
	
	var main_scene = get_tree().current_scene
	if not main_scene:
		return
	
	# Check collision with player (if not fired by player)
	var player = main_scene.get_node_or_null("Player")
	if player and owner_entity != player:
		var distance_to_player = tip_position.distance_to(player.position)
		if distance_to_player <= collision_radius + 16:  # 16 is approx player radius
			hit_entity(player)
			return
	
	# Check collision with any entity that has health (NPCs, Dragons, etc.)
	var world = get_node_or_null("/root/Main/World")
	if not world:
		# Try alternative path
		world = get_tree().current_scene.get_node_or_null("World")
	if world:
		# Check NPCs
		var npcs = world.get_npcs()
		print("DEBUG: Checking collision with ", npcs.size(), " NPCs")
		for npc in npcs:
			if npc and is_instance_valid(npc) and npc != owner_entity:
				var distance_to_npc = tip_position.distance_to(npc.position)
				print("DEBUG: NPC distance: ", distance_to_npc, " (threshold: ", collision_radius + 20, ")")
				if distance_to_npc <= collision_radius + 20:  # 20 is approx NPC radius
					print("DEBUG: HIT! Calling hit_entity on NPC")
					hit_entity(npc)
					return
		
		# Check dragons
		var dragons = world.get_dragons()
		for dragon in dragons:
			if dragon and is_instance_valid(dragon) and dragon != owner_entity:
				var distance_to_dragon = tip_position.distance_to(dragon.position)
				if distance_to_dragon <= collision_radius + 25:  # 25 is approx dragon radius
					hit_entity(dragon)
					return

func hit_entity(entity: Node2D):
	if has_hit or not is_active:
		return
	
	has_hit = true
	
	# Check if entity can take damage using a more generic approach
	if entity.has_method("take_damage"):
		# Entity has take_damage method (NPCs, Dragons, any custom entity with health)
		print("DEBUG: Spear hitting entity with take_damage method: ", entity.name)
		print("DEBUG: Entity health before: ", entity.current_health if "current_health" in entity else "unknown")
		entity.take_damage(damage)
		print("DEBUG: Entity health after: ", entity.current_health if "current_health" in entity else "unknown")
		var entity_name = entity.name if entity.name else "Entity"
		print("Spear hit ", entity_name, " for ", damage, " damage!")
	elif entity == get_tree().current_scene.get_node_or_null("Player"):
		# Hit player - use Global.player.stats
		if Global.player and Global.player.stats:
			Global.player.stats.damage(damage)
			print("Spear hit player for ", damage, " damage!")
			print("Player health: ", Global.player.stats.health, "/", Global.player.stats.max_health)
	else:
		# Try to damage any entity with health properties
		if "current_health" in entity:
			var current_health = entity.get("current_health")
			if current_health != null and current_health > 0:
				entity.set("current_health", max(0, current_health - damage))
				print("Spear hit ", entity.name, " for ", damage, " damage!")
			else:
				print("Spear hit entity with no health: ", entity.name)
		else:
			print("Spear hit non-damageable entity: ", entity.name)
	
	# Deactivate spear
	deactivate_spear()

func deactivate_spear():
	"""Deactivate spear and return it to the pool"""
	reset_spear()
	
	# Notify pool that this spear is available
	var spear_pool = get_node_or_null("/root/Main/SpearPool")
	if not spear_pool:
		# Try alternative path
		spear_pool = get_tree().current_scene.get_node_or_null("SpearPool")
	if spear_pool:
		spear_pool.return_spear(self)

func _on_hit_area_entered(area: Area2D):
	"""Called when the spear's hit area enters another Area2D"""
	if has_hit or not is_active:
		return
	
	# Get the parent node which should be the entity (NavyAirship, etc)
	var entity = area.get_parent()
	if entity and entity != owner_entity:
		print("DEBUG: Spear hit area collision with: ", entity.name)
		if entity.has_method("take_damage"):
			hit_entity(entity)

func _on_hit_body_entered(body: Node2D):
	"""Called when the spear's hit area enters a physics body"""
	if has_hit or not is_active:
		return
	
	# Handle collision with physics bodies if needed
	if body and body != owner_entity:
		print("DEBUG: Spear hit body collision with: ", body.name)
		if body.has_method("take_damage"):
			hit_entity(body)
