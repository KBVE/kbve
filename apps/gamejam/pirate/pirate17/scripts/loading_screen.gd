class_name LoadingScreen
extends Control

signal loading_complete

@onready var progress_bar: ProgressBar
@onready var progress_label: Label
@onready var status_label: Label
@onready var background_sprite: Sprite2D

var current_progress: float = 0.0
var target_progress: float = 0.0
var loading_steps: Array[Dictionary] = []
var current_step_index: int = 0
var is_loading: bool = false

func _ready():
	setup_loading_screen()
	setup_loading_steps()
	start_background_animations()

func setup_loading_screen():
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	
	setup_background()
	setup_ui_elements()

func setup_background():
	var sky_texture = load("res://assets/background/sky.png")
	if sky_texture:
		background_sprite = Sprite2D.new()
		background_sprite.texture = sky_texture
		background_sprite.z_index = -10
		
		var screen_size = get_viewport().get_visible_rect().size
		var texture_size = sky_texture.get_size()
		
		var scale_x = screen_size.x / texture_size.x
		var scale_y = screen_size.y / texture_size.y
		
		background_sprite.position = screen_size / 2
		background_sprite.scale = Vector2(scale_x, scale_y)
		background_sprite.modulate = Color(0.7, 0.7, 0.7, 1.0)
		
		add_child(background_sprite)

func setup_ui_elements():
	var screen_size = get_viewport().get_visible_rect().size
	
	var loading_container = VBoxContainer.new()
	loading_container.anchors_preset = Control.PRESET_CENTER
	loading_container.position = Vector2(screen_size.x / 2 - 200, screen_size.y / 2 - 50)
	loading_container.size = Vector2(400, 100)
	loading_container.add_theme_constant_override("separation", 20)
	add_child(loading_container)
	
	var title_label = Label.new()
	title_label.text = "Setting Sail..."
	title_label.add_theme_font_size_override("font_size", 32)
	title_label.add_theme_color_override("font_color", Color.WHITE)
	title_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	title_label.add_theme_constant_override("shadow_offset_x", 2)
	title_label.add_theme_constant_override("shadow_offset_y", 2)
	title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_container.add_child(title_label)
	
	progress_bar = ProgressBar.new()
	progress_bar.size = Vector2(400, 20)
	progress_bar.min_value = 0
	progress_bar.max_value = 100
	progress_bar.value = 0
	progress_bar.show_percentage = false
	
	var progress_style_bg = StyleBoxFlat.new()
	progress_style_bg.bg_color = Color(0.2, 0.2, 0.2, 0.8)
	progress_style_bg.corner_radius_top_left = 10
	progress_style_bg.corner_radius_top_right = 10
	progress_style_bg.corner_radius_bottom_left = 10
	progress_style_bg.corner_radius_bottom_right = 10
	
	var progress_style_fg = StyleBoxFlat.new()
	progress_style_fg.bg_color = Color(0.3, 0.7, 1.0, 1.0)
	progress_style_fg.corner_radius_top_left = 10
	progress_style_fg.corner_radius_top_right = 10
	progress_style_fg.corner_radius_bottom_left = 10
	progress_style_fg.corner_radius_bottom_right = 10
	
	progress_bar.add_theme_stylebox_override("background", progress_style_bg)
	progress_bar.add_theme_stylebox_override("fill", progress_style_fg)
	loading_container.add_child(progress_bar)
	
	progress_label = Label.new()
	progress_label.text = "0%"
	progress_label.add_theme_font_size_override("font_size", 16)
	progress_label.add_theme_color_override("font_color", Color.WHITE)
	progress_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	progress_label.add_theme_constant_override("shadow_offset_x", 1)
	progress_label.add_theme_constant_override("shadow_offset_y", 1)
	progress_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_container.add_child(progress_label)
	
	status_label = Label.new()
	status_label.text = "Preparing to load..."
	status_label.add_theme_font_size_override("font_size", 14)
	status_label.add_theme_color_override("font_color", Color.LIGHT_GRAY)
	status_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	status_label.add_theme_constant_override("shadow_offset_x", 1)
	status_label.add_theme_constant_override("shadow_offset_y", 1)
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_container.add_child(status_label)
	
	# Add loading tips below main container
	setup_loading_tips()

func setup_loading_tips():
	var screen_size = get_viewport().get_visible_rect().size
	
	var tips_container = VBoxContainer.new()
	tips_container.anchors_preset = Control.PRESET_CENTER
	tips_container.position = Vector2(screen_size.x / 2 - 300, screen_size.y / 2 + 120)
	tips_container.size = Vector2(600, 100)
	tips_container.add_theme_constant_override("separation", 8)
	add_child(tips_container)
	
	var tip_title = Label.new()
	tip_title.text = "⚓ Captain's Tips ⚓"
	tip_title.add_theme_font_size_override("font_size", 18)
	tip_title.add_theme_color_override("font_color", Color.GOLD)
	tip_title.add_theme_color_override("font_shadow_color", Color.BLACK)
	tip_title.add_theme_constant_override("shadow_offset_x", 1)
	tip_title.add_theme_constant_override("shadow_offset_y", 1)
	tip_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tips_container.add_child(tip_title)
	
	var loading_tips = [
		"🔥 Use spears to attack enemies and defend your ship!",
		"⚔️ Navy ships work together - they'll call for reinforcements!",
		"🏠 Navy ships return to docks when damaged to heal up",
		"🗺️ Explore different structures like ports, villages, and castles",
		"⛵ Your airship can move in 8 directions using WASD or arrow keys",
		"🎯 Right-click to aim and launch spears at enemy targets",
		"🏴‍☠️ Take on supply runs, reconnaissance, and escort missions",
		"🔧 Visit ports to repair and resupply your airship",
		"🌊 Avoid ocean tiles - only land-based movement allowed!",
		"📊 Check your health and stats in the top-left corner"
	]
	
	var random_tip = loading_tips[randi() % loading_tips.size()]
	
	var tip_label = Label.new()
	tip_label.text = random_tip
	tip_label.add_theme_font_size_override("font_size", 14)
	tip_label.add_theme_color_override("font_color", Color.LIGHT_BLUE)
	tip_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	tip_label.add_theme_constant_override("shadow_offset_x", 1)
	tip_label.add_theme_constant_override("shadow_offset_y", 1)
	tip_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tip_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tip_label.custom_minimum_size = Vector2(600, 0)
	tips_container.add_child(tip_label)

func setup_loading_steps():
	loading_steps = [
		{
			"name": "Initializing Systems",
			"function": "init_systems",
			"weight": 5.0
		},
		{
			"name": "Loading UI Resources", 
			"function": "load_ui_resources",
			"weight": 10.0
		},
		{
			"name": "Generating World",
			"function": "generate_world",
			"weight": 25.0
		},
		{
			"name": "Creating Map Chunks",
			"function": "setup_chunks",
			"weight": 20.0
		},
		{
			"name": "Placing Structures",
			"function": "place_structures", 
			"weight": 15.0
		},
		{
			"name": "Spawning Navy Fleet",
			"function": "spawn_navy",
			"weight": 15.0
		},
		{
			"name": "Setting up Player",
			"function": "setup_player",
			"weight": 5.0
		},
		{
			"name": "Finalizing Scene",
			"function": "finalize_scene",
			"weight": 5.0
		}
	]

func start_loading():
	if is_loading:
		return
	
	is_loading = true
	current_step_index = 0
	current_progress = 0.0
	target_progress = 0.0
	
	print("LoadingScreen: Starting loading process with ", loading_steps.size(), " steps")
	process_next_step()

func process_next_step():
	if current_step_index >= loading_steps.size():
		complete_loading()
		return
	
	var step = loading_steps[current_step_index]
	status_label.text = step.name + "..."
	print("LoadingScreen: Processing step ", current_step_index + 1, "/", loading_steps.size(), ": ", step.name)
	
	call_deferred("execute_loading_step", step)

func execute_loading_step(step: Dictionary):
	var step_function = step.function
	var step_weight = step.weight
	
	match step_function:
		"init_systems":
			await init_systems()
		"load_ui_resources":
			await load_ui_resources()
		"generate_world":
			await generate_world()
		"setup_chunks":
			await setup_chunks()
		"place_structures":
			await place_structures()
		"spawn_navy":
			await spawn_navy()
		"setup_player":
			await setup_player()
		"finalize_scene":
			await finalize_scene()
	
	target_progress += step_weight
	current_step_index += 1
	
	await animate_progress_to_target()
	
	await get_tree().process_frame
	
	process_next_step()

func animate_progress_to_target():
	var tween = create_tween()
	tween.tween_method(update_progress_display, current_progress, target_progress, 0.3)
	await tween.finished
	current_progress = target_progress

func update_progress_display(progress: float):
	progress_bar.value = progress
	progress_label.text = str(int(progress)) + "%"

func init_systems():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("init_basic_systems"):
		main_scene.init_basic_systems()
	
	await get_tree().create_timer(0.1).timeout

func load_ui_resources():
	BorderSlicer.is_loaded = false
	BorderSlicer.load_and_slice_borders()
	
	await get_tree().create_timer(0.2).timeout

func generate_world():
	World.initialize_world()
	
	await get_tree().create_timer(0.3).timeout

func setup_chunks():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("init_chunk_manager"):
		main_scene.init_chunk_manager()
	
	await get_tree().create_timer(0.4).timeout

func place_structures():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("init_structures"):
		main_scene.init_structures()
	
	await get_tree().create_timer(0.3).timeout

func spawn_navy():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("init_npcs"):
		main_scene.init_npcs()
	
	await get_tree().create_timer(0.5).timeout

func setup_player():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("init_player_systems"):
		main_scene.init_player_systems()
	
	await get_tree().create_timer(0.2).timeout

func finalize_scene():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("finalize_initialization"):
		main_scene.finalize_initialization()
	
	await get_tree().create_timer(0.1).timeout

func complete_loading():
	print("LoadingScreen: Loading complete!")
	status_label.text = "Ready to sail! Welcome aboard, Captain!"
	
	var complete_tween = create_tween()
	complete_tween.set_parallel(true)
	complete_tween.tween_property(self, "modulate:a", 0.0, 1.0)
	
	await complete_tween.finished
	
	loading_complete.emit()
	queue_free()

func start_background_animations():
	"""Add subtle animations to make loading screen more engaging"""
	if background_sprite:
		# Subtle sky color animation
		var sky_tween = create_tween()
		sky_tween.set_loops()
		sky_tween.set_parallel(true)
		
		# Gentle color shift
		sky_tween.tween_method(
			func(color_shift: float):
				var base_color = Color(0.7, 0.7, 0.7, 1.0)
				var warm_tint = Color(0.8, 0.75, 0.65, 1.0)
				background_sprite.modulate = base_color.lerp(warm_tint, color_shift),
			0.0, 1.0, 3.0
		)
		sky_tween.tween_method(
			func(color_shift: float):
				var base_color = Color(0.7, 0.7, 0.7, 1.0)
				var warm_tint = Color(0.8, 0.75, 0.65, 1.0)
				background_sprite.modulate = warm_tint.lerp(base_color, color_shift),
			0.0, 1.0, 3.0
		)

func _process(delta):
	if is_loading and current_progress < target_progress:
		current_progress = move_toward(current_progress, target_progress, delta * 50.0)
		update_progress_display(current_progress)