class_name DragonNPC
extends NPC

var attack_range: int = 8
var attack_cooldown: float = 3.0
var fireball_speed: float = 200.0
var dragon_state: DragonState = DragonState.IDLE
var attack_timer: Timer
var is_attacking: bool = false
var dragon_attack_texture: Texture2D
var projectile_container: Node2D

enum DragonState {
	IDLE,
	ATTACKING,
	RECOVERING
}

func _ready():
	super._ready()
	setup_dragon_properties()
	setup_attack_timer()
	setup_projectile_container()

func setup_dragon_properties():
	movement_interval = 3.0
	movement_range = 12
	detection_range = 8
	chase_threshold = 10
	reset_distance = 15
	follow_distance = 5
	aggression_check_interval = 1.5
	dragon_attack_texture = load("res://assets/dragon/DragonAttack.png")

func create_visual():
	var visual_container = Node2D.new()
	visual_container.z_index = 15
	
	npc_sprite = Sprite2D.new()
	npc_sprite.texture = load("res://assets/dragon/Dragon.png")
	npc_sprite.position = Vector2.ZERO
	npc_sprite.z_index = 1
	npc_sprite.scale = Vector2(0.6, 0.6)
	npc_sprite.flip_h = false
	
	visual_container.add_child(npc_sprite)
	
	var ship_shadow = preload("res://scripts/ship_shadow.gd").new()
	ship_shadow.shadow_offset = Vector2(16, 20)
	ship_shadow.shadow_scale = 0.9
	visual_container.add_child(ship_shadow)
	
	call_deferred("_adjust_shadow_z_index", ship_shadow)
	
	state_badge = FantasyStateBadge.new()
	state_badge.state_text = "Dragon"
	state_badge.z_index = 25
	visual_container.add_child(state_badge)
	
	call_deferred("position_state_badge")
	add_child(visual_container)

func update_state_label():
	if state_badge:
		match dragon_state:
			DragonState.IDLE:
				match current_state:
					NPCState.PATROL:
						state_badge.update_state("Sleeping...")
					NPCState.AGGRESSIVE:
						state_badge.update_state("Hunting!")
					NPCState.RETURNING:
						state_badge.update_state("Retreating...")
			DragonState.ATTACKING:
				state_badge.update_state("ATTACKING!")
			DragonState.RECOVERING:
				state_badge.update_state("Recovering...")
		
		call_deferred("position_state_badge")

func setup_attack_timer():
	attack_timer = Timer.new()
	attack_timer.wait_time = attack_cooldown
	attack_timer.one_shot = true
	attack_timer.timeout.connect(_on_attack_cooldown_finished)
	add_child(attack_timer)

func setup_projectile_container():
	var main_scene = get_tree().current_scene
	if main_scene:
		projectile_container = main_scene.get_node_or_null("Projectiles")
		if not projectile_container:
			projectile_container = Node2D.new()
			projectile_container.name = "Projectiles"
			projectile_container.z_index = 20
			main_scene.add_child(projectile_container)

func _on_movement_timer_timeout():
	var player_distance = get_distance_to_player()
	
	if player_distance <= attack_range and not is_attacking and attack_timer.is_stopped():
		attempt_fireball_attack()
		return
	
	super._on_movement_timer_timeout()

func _on_aggression_check_timeout():
	var player_distance = get_distance_to_player()
	
	if player_distance <= attack_range and not is_attacking and attack_timer.is_stopped():
		attempt_fireball_attack()
	else:
		super._on_aggression_check_timeout()

func attempt_fireball_attack():
	var main_scene = get_tree().current_scene
	if not main_scene or not main_scene.has_method("get_player_position"):
		return
	
	var player_pos = main_scene.get_player_position()
	var player_world_pos = Movement.get_world_position(player_pos)
	var dragon_world_pos = Movement.get_world_position(grid_position)
	
	var distance = dragon_world_pos.distance_to(player_world_pos)
	if distance <= attack_range * World.TILE_SIZE:
		perform_fireball_attack(player_world_pos)

func perform_fireball_attack(target_pos: Vector2):
	is_attacking = true
	dragon_state = DragonState.ATTACKING
	update_state_label()
	
	if not npc_sprite:
		create_visual()
	
	if dragon_attack_texture and npc_sprite:
		npc_sprite.texture = dragon_attack_texture
	
	var direction = (target_pos - position).normalized()
	if npc_sprite and is_instance_valid(npc_sprite):
		var target_angle = atan2(direction.y, direction.x) - PI / 2
		var attack_rotation_tween = create_tween()
		attack_rotation_tween.set_ease(Tween.EASE_OUT)
		attack_rotation_tween.set_trans(Tween.TRANS_BACK)
		attack_rotation_tween.tween_property(npc_sprite, "rotation", target_angle, 0.2)
	
	var attack_delay_timer = Timer.new()
	attack_delay_timer.wait_time = 0.5
	attack_delay_timer.one_shot = true
	attack_delay_timer.timeout.connect(func(): 
		launch_fireball(target_pos)
		attack_delay_timer.queue_free()
	)
	add_child(attack_delay_timer)
	attack_delay_timer.start()
	attack_timer.start()

func launch_fireball(target_pos: Vector2):
	if not projectile_container:
		setup_projectile_container()
	
	var fireball = preload("res://scripts/entities/fireball.gd").new()
	fireball.position = position
	fireball.set_target(target_pos, fireball_speed)
	fireball.damage = 1
	fireball.owner_entity = self
	
	projectile_container.add_child(fireball)
	
	var recovery_timer = Timer.new()
	recovery_timer.wait_time = 0.3
	recovery_timer.one_shot = true
	recovery_timer.timeout.connect(func():
		if npc_sprite and is_instance_valid(npc_sprite):
			npc_sprite.texture = load("res://assets/dragon/Dragon.png")
		dragon_state = DragonState.RECOVERING
		update_state_label()
		recovery_timer.queue_free()
	)
	add_child(recovery_timer)
	recovery_timer.start()

func _on_attack_cooldown_finished():
	is_attacking = false
	dragon_state = DragonState.IDLE
	update_state_label()

func update_visual_state():
	if npc_sprite and is_instance_valid(npc_sprite):
		match dragon_state:
			DragonState.ATTACKING:
				npc_sprite.modulate = Color(1.0, 0.3, 0.3, 1.0)
			DragonState.RECOVERING:
				npc_sprite.modulate = Color(1.0, 0.7, 0.4, 1.0)
			DragonState.IDLE:
				super.update_visual_state()
	else:
		create_visual()

func is_valid_move(pos: Vector2i) -> bool:
	if pos.x < 0 or pos.x >= World.MAP_WIDTH or pos.y < 0 or pos.y >= World.MAP_HEIGHT:
		return false
	
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("get_player_position"):
		var player_pos = main_scene.get_player_position()
		if pos == player_pos:
			return false
		
		if current_state == NPCState.AGGRESSIVE:
			var distance_to_player = abs(pos.x - player_pos.x) + abs(pos.y - player_pos.y)
			if distance_to_player < follow_distance:
				return false
	
	if current_state == NPCState.PATROL:
		var distance = abs(pos.x - spawn_position.x) + abs(pos.y - spawn_position.y)
		if distance > movement_range:
			return false
	
	return true

func update_npc_rotation(from: Vector2i, to: Vector2i):
	if not npc_sprite:
		return
		
	var movement_vector = to - from
	if movement_vector == Vector2i.ZERO:
		return
	
	var angle = atan2(movement_vector.y, movement_vector.x)
	var target_angle = angle - PI / 2
	
	var rotation_tween = create_tween()
	rotation_tween.set_ease(Tween.EASE_OUT)
	rotation_tween.set_trans(Tween.TRANS_QUART)
	rotation_tween.tween_property(npc_sprite, "rotation", target_angle, 0.3)
