class_name AirshipAmmoUI
extends Control

signal spear_fired(target_position: Vector2)
signal auto_fire_toggled(enabled: bool)

@onready var fire_button: Button
@onready var auto_fire_toggle: CheckBox
@onready var cooldown_progress: ProgressBar
@onready var ammo_count_label: Label
@onready var fire_mode_label: Label

var is_auto_fire_enabled: bool = false
var fire_cooldown_timer: Timer
var is_on_cooldown: bool = false
var spear_cooldown_duration: float = 3.0
var current_ammo: int = 20
var max_ammo: int = 20

var player_ref: Node2D = null
var main_scene_ref: Node = null

func _ready():
	setup_ui_elements()
	setup_cooldown_timer()
	update_ammo_display()
	update_fire_mode_display()

func setup_ui_elements():
	# Create the main container with proper sizing
	var main_container = Control.new()
	main_container.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	main_container.position = Vector2(-240, -160)
	main_container.size = Vector2(220, 140)
	add_child(main_container)
	
	# Panel background using fantasy rectangle box
	var panel_bg = NinePatchRect.new()
	panel_bg.texture = load("res://assets/ui/fantasy/RectangleBox_96x96.png")
	panel_bg.size = Vector2(220, 140)
	panel_bg.patch_margin_left = 16
	panel_bg.patch_margin_right = 16
	panel_bg.patch_margin_top = 16
	panel_bg.patch_margin_bottom = 16
	main_container.add_child(panel_bg)
	
	# Inner pattern background for decoration
	var inner_bg = TextureRect.new()
	inner_bg.texture = load("res://assets/ui/fantasy/PatternMiddleBottomBG_199x48.png")
	inner_bg.position = Vector2(10, 10)
	inner_bg.size = Vector2(200, 120)
	inner_bg.stretch_mode = TextureRect.STRETCH_TILE
	inner_bg.modulate = Color(1.0, 1.0, 1.0, 0.3)
	main_container.add_child(inner_bg)
	
	# Add corner knots for decoration
	var corner_knot_texture = load("res://assets/ui/fantasy/CornerKnot_14x14.png")
	
	# Top-left corner
	var tl_knot = TextureRect.new()
	tl_knot.texture = corner_knot_texture
	tl_knot.position = Vector2(5, 5)
	main_container.add_child(tl_knot)
	
	# Top-right corner
	var tr_knot = TextureRect.new()
	tr_knot.texture = corner_knot_texture
	tr_knot.position = Vector2(201, 5)
	tr_knot.flip_h = true
	main_container.add_child(tr_knot)
	
	# Bottom-left corner
	var bl_knot = TextureRect.new()
	bl_knot.texture = corner_knot_texture
	bl_knot.position = Vector2(5, 121)
	bl_knot.flip_v = true
	main_container.add_child(bl_knot)
	
	# Bottom-right corner
	var br_knot = TextureRect.new()
	br_knot.texture = corner_knot_texture
	br_knot.position = Vector2(201, 121)
	br_knot.flip_h = true
	br_knot.flip_v = true
	main_container.add_child(br_knot)
	
	# Content container with proper margins
	var content_container = VBoxContainer.new()
	content_container.position = Vector2(20, 20)
	content_container.size = Vector2(180, 100)
	content_container.add_theme_constant_override("separation", 6)
	main_container.add_child(content_container)
	
	# Title with fantasy styling
	var title_container = CenterContainer.new()
	content_container.add_child(title_container)
	
	var title_bg = TextureRect.new()
	title_bg.texture = load("res://assets/ui/fantasy/TitleBox_64x16.png")
	title_bg.custom_minimum_size = Vector2(160, 16)
	title_bg.stretch_mode = TextureRect.STRETCH_TILE
	title_container.add_child(title_bg)
	
	var title_label = Label.new()
	title_label.text = "🎯 WEAPON SYSTEM"
	title_label.add_theme_font_size_override("font_size", 11)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	title_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	title_label.add_theme_constant_override("shadow_offset_x", 1)
	title_label.add_theme_constant_override("shadow_offset_y", 1)
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	title_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	title_bg.add_child(title_label)
	
	# Fire button using fantasy UI
	fire_button = Button.new()
	fire_button.text = "🏹 FIRE SPEAR"
	fire_button.custom_minimum_size = Vector2(170, 20)
	
	# Use fantasy button texture
	var button_texture = load("res://assets/ui/fantasy/Button_52x14.png")
	var button_style = StyleBoxTexture.new()
	button_style.texture = button_texture
	button_style.region_rect = Rect2(0, 0, 52, 14)
	
	# Set content margins to fit text properly
	button_style.content_margin_left = 8
	button_style.content_margin_right = 8
	button_style.content_margin_top = 2
	button_style.content_margin_bottom = 2
	
	# Create highlight version for hover/pressed
	var highlight_texture = load("res://assets/ui/fantasy/HighlightButton_60x23.png")
	var highlight_style = StyleBoxTexture.new()
	highlight_style.texture = highlight_texture
	highlight_style.region_rect = Rect2(0, 0, 60, 23)
	highlight_style.content_margin_left = 8
	highlight_style.content_margin_right = 8
	highlight_style.content_margin_top = 2
	highlight_style.content_margin_bottom = 2
	
	fire_button.add_theme_stylebox_override("normal", button_style)
	fire_button.add_theme_stylebox_override("hover", highlight_style)
	fire_button.add_theme_stylebox_override("pressed", highlight_style)
	fire_button.add_theme_color_override("font_color", Color.WHITE)
	fire_button.add_theme_color_override("font_shadow_color", Color.BLACK)
	fire_button.add_theme_constant_override("shadow_offset_x", 1)
	fire_button.add_theme_constant_override("shadow_offset_y", 1)
	fire_button.add_theme_font_size_override("font_size", 10)
	
	fire_button.pressed.connect(_on_fire_button_pressed)
	content_container.add_child(fire_button)
	
	# Auto-fire toggle
	var auto_fire_container = HBoxContainer.new()
	content_container.add_child(auto_fire_container)
	
	auto_fire_toggle = CheckBox.new()
	auto_fire_toggle.button_pressed = is_auto_fire_enabled
	auto_fire_toggle.toggled.connect(_on_auto_fire_toggled)
	auto_fire_container.add_child(auto_fire_toggle)
	
	var auto_fire_label = Label.new()
	auto_fire_label.text = "Auto-Fire"
	auto_fire_label.add_theme_font_size_override("font_size", 10)
	auto_fire_label.add_theme_color_override("font_color", Color.WHITE)
	auto_fire_container.add_child(auto_fire_label)
	
	# Cooldown progress bar using fantasy UI
	cooldown_progress = ProgressBar.new()
	cooldown_progress.custom_minimum_size = Vector2(170, 12)
	cooldown_progress.min_value = 0
	cooldown_progress.max_value = 100
	cooldown_progress.value = 0
	cooldown_progress.show_percentage = false
	
	# Use fantasy progress bar textures
	var progress_bg_texture = load("res://assets/ui/fantasy/ValueBar_128x16.png")
	var progress_style_bg = StyleBoxTexture.new()
	progress_style_bg.texture = progress_bg_texture
	progress_style_bg.region_rect = Rect2(0, 0, 128, 16)
	progress_style_bg.content_margin_left = 4
	progress_style_bg.content_margin_right = 4
	progress_style_bg.content_margin_top = 2
	progress_style_bg.content_margin_bottom = 2
	
	var progress_fill_texture = load("res://assets/ui/fantasy/ValueBlue_120x8.png")
	var progress_style_fg = StyleBoxTexture.new()
	progress_style_fg.texture = progress_fill_texture
	progress_style_fg.region_rect = Rect2(0, 0, 120, 8)
	progress_style_fg.content_margin_left = 2
	progress_style_fg.content_margin_right = 2
	progress_style_fg.content_margin_top = 1
	progress_style_fg.content_margin_bottom = 1
	
	cooldown_progress.add_theme_stylebox_override("background", progress_style_bg)
	cooldown_progress.add_theme_stylebox_override("fill", progress_style_fg)
	content_container.add_child(cooldown_progress)
	
	# Ammo count and fire mode labels with fantasy styling
	var info_container = HBoxContainer.new()
	info_container.add_theme_constant_override("separation", 8)
	content_container.add_child(info_container)
	
	# Ammo count with icon
	var ammo_container = HBoxContainer.new()
	info_container.add_child(ammo_container)
	
	var ammo_icon = TextureRect.new()
	ammo_icon.texture = load("res://assets/ui/fantasy/ItemsIcons_24x24.png")
	ammo_icon.custom_minimum_size = Vector2(12, 12)
	ammo_icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT
	ammo_container.add_child(ammo_icon)
	
	ammo_count_label = Label.new()
	ammo_count_label.add_theme_font_size_override("font_size", 10)
	ammo_count_label.add_theme_color_override("font_color", Color.WHITE)
	ammo_count_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	ammo_count_label.add_theme_constant_override("shadow_offset_x", 1)
	ammo_count_label.add_theme_constant_override("shadow_offset_y", 1)
	ammo_container.add_child(ammo_count_label)
	
	var spacer = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info_container.add_child(spacer)
	
	fire_mode_label = Label.new()
	fire_mode_label.add_theme_font_size_override("font_size", 10)
	fire_mode_label.add_theme_color_override("font_color", Color.GOLD)
	fire_mode_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	fire_mode_label.add_theme_constant_override("shadow_offset_x", 1)
	fire_mode_label.add_theme_constant_override("shadow_offset_y", 1)
	info_container.add_child(fire_mode_label)

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
			fire_button.text = "🕐 RELOADING..."
			fire_button.disabled = true
		elif current_ammo <= 0:
			fire_button.text = "❌ NO AMMO"
			fire_button.disabled = true
		else:
			fire_button.text = "🏹 FIRE SPEAR"
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
