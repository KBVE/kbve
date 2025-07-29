class_name NPC
extends Node2D

signal health_changed(new_health: int, max_health: int)
signal died

@export var max_health: int = 20
@export var max_mana: int = 20

var current_health: int
var current_mana: int

# Additional properties expected by subclasses
var dock_healing_rate: int = 1
var movement_range: int = 10
var detection_range: int = 8
var attack_cooldown: float = 2.0
var spear_speed: float = 200.0
var grid_position: Vector2i = Vector2i(0, 0)
var current_dock_target: Vector2i = Vector2i(-1, -1)
var help_target_position: Vector2i = Vector2i(-1, -1)
var is_responding_to_help: bool = false

# Dragon/AI specific properties
var movement_interval: float = 2.0
var chase_threshold: int = 10
var reset_distance: int = 15
var follow_distance: int = 3
var aggression_check_interval: float = 1.0
var attack_range: int = 8
var spawn_position: Vector2i = Vector2i(0, 0)
var is_attacking: bool = false
var attack_timer: Timer = null

# Visual components
var visual_container: Node2D = null
var npc_sprite: Sprite2D = null
var health_bar: Control = null
var is_active: bool = true

# UI references that may exist
var scene_health_bar: Control = null
var scene_health_label: Control = null
var scene_mana_bar: Control = null
var scene_mana_label: Control = null
var state_badge: Control = null
var movement_timer: Timer = null

# States
enum NPCState {
	IDLE,
	PATROL,
	AGGRESSIVE,
	RETREATING,
	RETURNING,
	DOCKED
}

var current_state: NPCState = NPCState.IDLE

func _ready():
	current_health = max_health
	current_mana = max_mana
	spawn_position = grid_position
	
	# Set up movement timer if it doesn't exist
	if not movement_timer:
		movement_timer = Timer.new()
		movement_timer.wait_time = 2.0
		movement_timer.timeout.connect(_on_movement_timer_timeout)
		add_child(movement_timer)
		movement_timer.start()
	
	# Set up attack timer
	if not attack_timer:
		attack_timer = Timer.new()
		attack_timer.wait_time = attack_cooldown
		attack_timer.one_shot = true
		attack_timer.timeout.connect(_on_attack_cooldown_finished)
		add_child(attack_timer)
	
	# Create default state badge if needed
	if not state_badge:
		create_default_state_badge()

func take_damage(damage: int):
	current_health = max(0, current_health - damage)
	health_changed.emit(current_health, max_health)
	
	# Update UI if it exists
	if scene_health_bar:
		scene_health_bar.value = current_health
	if scene_health_label:
		scene_health_label.text = str(current_health) + "/" + str(max_health)
	
	if current_health <= 0:
		die()

func heal(amount: int):
	current_health = min(max_health, current_health + amount)
	health_changed.emit(current_health, max_health)
	
	# Update UI if it exists
	if scene_health_bar:
		scene_health_bar.value = current_health
	if scene_health_label:
		scene_health_label.text = str(current_health) + "/" + str(max_health)

func consume_mana(amount: int) -> bool:
	if current_mana >= amount:
		current_mana -= amount
		# Update UI if it exists
		if scene_mana_bar:
			scene_mana_bar.value = current_mana
		if scene_mana_label:
			scene_mana_label.text = str(current_mana) + "/" + str(max_mana)
		return true
	return false

func restore_mana(amount: int):
	current_mana = min(max_mana, current_mana + amount)
	# Update UI if it exists
	if scene_mana_bar:
		scene_mana_bar.value = current_mana
	if scene_mana_label:
		scene_mana_label.text = str(current_mana) + "/" + str(max_mana)

func die():
	died.emit()

func get_health_percentage() -> float:
	return float(current_health) / float(max_health)

func get_mana_percentage() -> float:
	return float(current_mana) / float(max_mana)

# Basic movement and state management
func transition_to_state(new_state: NPCState):
	current_state = new_state

func move_to(new_pos: Vector2i):
	grid_position = new_pos
	# Update actual position based on grid
	if has_method("update_world_position"):
		call("update_world_position")

func is_valid_move(pos: Vector2i) -> bool:
	# Basic validation - subclasses should override this
	return pos.x >= 0 and pos.y >= 0

func attempt_move_to_help_target():
	if help_target_position == Vector2i(-1, -1):
		return
	
	var direction = Vector2i(
		sign(help_target_position.x - grid_position.x),
		sign(help_target_position.y - grid_position.y)
	)
	
	var new_pos = grid_position + direction
	if is_valid_move(new_pos):
		move_to(new_pos)

# Timer callback - can be overridden by subclasses
func _on_movement_timer_timeout():
	# Basic AI behavior - subclasses should override
	pass

func _on_attack_cooldown_finished():
	# Called when attack cooldown finishes
	is_attacking = false

func _on_aggression_check_timeout():
	# Called for aggression checks - subclasses should override
	pass

func find_nearest_target() -> Node2D:
	# Basic target finding - subclasses should override
	return null

func update_visual_state():
	# Update visual appearance based on state
	if npc_sprite and is_instance_valid(npc_sprite):
		match current_state:
			NPCState.AGGRESSIVE:
				npc_sprite.modulate = Color(1.0, 0.7, 0.7, 1.0)
			NPCState.RETREATING:
				npc_sprite.modulate = Color(0.7, 0.7, 1.0, 1.0)
			_:
				npc_sprite.modulate = Color.WHITE

func create_visual():
	# Create visual representation - subclasses should override
	pass

func position_state_badge():
	# Position the state badge - subclasses can override
	if state_badge:
		state_badge.position = Vector2(0, -40)

func update_state(new_state_text: String):
	# Update the state badge text
	if state_badge and state_badge.has_method("set_text"):
		state_badge.text = new_state_text
	elif state_badge and state_badge.has_method("update_state"):
		state_badge.update_state(new_state_text)

func _adjust_shadow_z_index(shadow):
	# Adjust shadow z-index
	if shadow:
		shadow.z_index = -1

func activate():
	# Activate the NPC
	is_active = true
	visible = true
	set_process(true)

func deactivate():
	# Deactivate the NPC
	is_active = false
	visible = false
	set_process(false)

func update_position_after_scene_ready():
	# Update position after being added to scene
	if has_method("update_world_position"):
		call("update_world_position")

func enable_web_optimizations():
	# Enable web-specific optimizations
	pass

func create_default_state_badge():
	# Create a proper FantasyStateBadge
	state_badge = FantasyStateBadge.new()
	state_badge.state_text = "NPC"
	state_badge.z_index = 25