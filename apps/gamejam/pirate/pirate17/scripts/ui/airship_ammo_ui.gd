class_name AirshipAmmoUI
extends Control

signal spear_fired(target_position: Vector2)
signal auto_fire_toggled(enabled: bool)

@onready var fire_button: Button = $MainContainer/ContentContainer/FireButton
@onready var auto_fire_toggle: CheckBox = $MainContainer/ContentContainer/AutoFireContainer/AutoFireToggle
@onready var cooldown_progress: ProgressBar = $MainContainer/ContentContainer/CooldownProgress
@onready var ammo_count_label: Label = $MainContainer/ContentContainer/InfoContainer/AmmoContainer/AmmoCountLabel
@onready var fire_mode_label: Label = $MainContainer/ContentContainer/InfoContainer/FireModeLabel

var is_auto_fire_enabled: bool = false
var fire_cooldown_timer: Timer
var is_on_cooldown: bool = false
var spear_cooldown_duration: float = 3.0
var current_ammo: int = 20
var max_ammo: int = 20

var player_ref: Node2D = null
var main_scene_ref: Node = null

func _ready():
	setup_cooldown_timer()
	setup_ui_connections()
	update_ammo_display()
	update_fire_mode_display()

func setup_ui_connections():
	# Connect button signals since @onready handles node references
	fire_button.pressed.connect(_on_fire_button_pressed)
	auto_fire_toggle.toggled.connect(_on_auto_fire_toggled)
	auto_fire_toggle.button_pressed = is_auto_fire_enabled

func setup_cooldown_timer():
	fire_cooldown_timer = Timer.new()
	fire_cooldown_timer.wait_time = spear_cooldown_duration
	fire_cooldown_timer.one_shot = true
	fire_cooldown_timer.timeout.connect(_on_cooldown_finished)
	add_child(fire_cooldown_timer)

func set_references(player: Node2D, main_scene: Node):
	player_ref = player
	main_scene_ref = main_scene

func _process(delta):
	# Update cooldown progress bar
	if is_on_cooldown and fire_cooldown_timer:
		var time_left = fire_cooldown_timer.time_left
		var progress = ((spear_cooldown_duration - time_left) / spear_cooldown_duration) * 100
		cooldown_progress.value = progress
	else:
		cooldown_progress.value = 100
	
	# Handle auto-fire
	if is_auto_fire_enabled and not is_on_cooldown and current_ammo > 0:
		attempt_auto_fire()

func _on_fire_button_pressed():
	if not is_on_cooldown and current_ammo > 0:
		fire_spear()

func _on_auto_fire_toggled(enabled: bool):
	is_auto_fire_enabled = enabled
	update_fire_mode_display()
	auto_fire_toggled.emit(enabled)
	print("Auto-fire ", "enabled" if enabled else "disabled")

func _on_cooldown_finished():
	is_on_cooldown = false
	update_fire_button_state()
	play_reload_ready_shimmer()
	print("Spear firing ready!")

func fire_spear():
	if is_on_cooldown or current_ammo <= 0:
		return
	
	if not main_scene_ref:
		print("Main scene reference not set!")
		return
	
	# Get target position (either enemy or mouse direction)
	var target_pos = get_target_position()
	
	# Fire the spear using main scene's spear system
	if main_scene_ref.has_method("fire_player_spear_at_position"):
		var success = main_scene_ref.fire_player_spear_at_position(target_pos)
		if success:
			start_cooldown()
			consume_ammo()
			spear_fired.emit(target_pos)
		else:
			print("Failed to fire spear - no spears available!")
	else:
		# Fallback to the original firing method
		if main_scene_ref.has_method("fire_player_spear"):
			main_scene_ref.fire_player_spear()
			start_cooldown()
			consume_ammo()
			spear_fired.emit(target_pos)

func attempt_auto_fire():
	if not main_scene_ref or not player_ref:
		return
	
	# Only auto-fire if there are enemies nearby
	var target = find_nearest_enemy()
	if target:
		fire_spear()

func find_nearest_enemy() -> Node2D:
	if not main_scene_ref or not player_ref:
		return null
	
	# Use the main scene's enemy finding method if available
	if main_scene_ref.has_method("find_nearest_enemy_target"):
		return main_scene_ref.find_nearest_enemy_target(player_ref.position)
	
	return null

func get_target_position() -> Vector2:
	if not player_ref:
		return Vector2.ZERO
	
	var player_pos = player_ref.position
	
	# If auto-fire is enabled, target nearest enemy
	if is_auto_fire_enabled:
		var target = find_nearest_enemy()
		if target:
			return target.position
		else:
			# No enemies found, don't fire in auto mode
			return Vector2.ZERO
	else:
		# Manual mode - fire toward mouse
		var mouse_pos = get_global_mouse_position()
		return mouse_pos
	
	return Vector2.ZERO

func start_cooldown():
	is_on_cooldown = true
	fire_cooldown_timer.start()
	update_fire_button_state()

func consume_ammo():
	current_ammo = max(0, current_ammo - 1)
	update_ammo_display()

func reload_ammo(amount: int = -1):
	if amount == -1:
		current_ammo = max_ammo
	else:
		current_ammo = min(max_ammo, current_ammo + amount)
	update_ammo_display()
	print("Spears reloaded! Ammo: ", current_ammo, "/", max_ammo)

func update_ammo_display():
	if ammo_count_label:
		ammo_count_label.text = "Ammo: " + str(current_ammo) + "/" + str(max_ammo)

func update_fire_mode_display():
	if fire_mode_label:
		fire_mode_label.text = "AUTO" if is_auto_fire_enabled else "MANUAL"

func update_fire_button_state():
	if fire_button:
		if is_on_cooldown:
			fire_button.text = "RELOADING..."
			fire_button.disabled = true
		elif current_ammo <= 0:
			fire_button.text = "NO AMMO"
			fire_button.disabled = true
		else:
			fire_button.text = "FIRE SPEAR"
			fire_button.disabled = false

func set_cooldown_duration(duration: float):
	spear_cooldown_duration = duration
	if fire_cooldown_timer:
		fire_cooldown_timer.wait_time = duration

func get_cooldown_remaining() -> float:
	if fire_cooldown_timer and is_on_cooldown:
		return fire_cooldown_timer.time_left
	return 0.0

func is_ready_to_fire() -> bool:
	return not is_on_cooldown and current_ammo > 0

func try_manual_fire() -> bool:
	# Public method for manual firing (e.g., spacebar) that respects the same cooldown
	if not is_on_cooldown and current_ammo > 0:
		fire_spear()
		return true
	return false

func play_reload_ready_shimmer():
	# Create a shimmer effect on the fire button and progress bar
	if not fire_button:
		return
		
	# Flash the button with a bright color
	var original_modulate = fire_button.modulate
	var tween = create_tween()
	
	# Create a pulsing shimmer effect
	tween.set_loops(2)
	tween.tween_property(fire_button, "modulate", Color(1.5, 1.5, 1.0, 1.0), 0.2)
	tween.tween_property(fire_button, "modulate", original_modulate, 0.2)
	
	# Also flash the progress bar
	if cooldown_progress:
		var progress_tween = create_tween()
		progress_tween.set_loops(2)
		progress_tween.tween_property(cooldown_progress, "modulate", Color(1.0, 1.5, 1.5, 1.0), 0.2)
		progress_tween.tween_property(cooldown_progress, "modulate", Color.WHITE, 0.2)
