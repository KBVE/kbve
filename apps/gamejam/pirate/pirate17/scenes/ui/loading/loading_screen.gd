class_name LoadingScreen
extends Control

signal loading_complete

@onready var progress_bar: ProgressBar = $LoadingContainer/ProgressBar
@onready var progress_label: Label = $LoadingContainer/ProgressLabel
@onready var status_label: Label = $LoadingContainer/StatusLabel
@onready var background_sprite: Sprite2D = $BackgroundSprite
@onready var tip_label: Label = $TipsContainer/TipLabel

var current_progress: float = 0.0
var target_progress: float = 0.0
var loading_steps: Array[Dictionary] = []
var current_step_index: int = 0
var is_loading: bool = false

func _ready():
	setup_loading_steps()
	setup_random_tip()
	start_background_animations()

func setup_random_tip():
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
	tip_label.text = random_tip

func setup_loading_steps():
	loading_steps = [
		{
			"name": "Initializing Systems",
			"function": "init_systems",
			"weight": 5.0,
			"sub_steps": [
				"Applying web rendering optimizations...",
				"Setting up basic game systems..."
			]
		},
		{
			"name": "Loading UI Resources", 
			"function": "load_ui_resources",
			"weight": 10.0,
			"sub_steps": [
				"Loading border slice textures...",
				"Preparing UI element cache...",
				"Setting up theme resources..."
			]
		},
		{
			"name": "Generating World",
			"function": "generate_world",
			"weight": 25.0,
			"sub_steps": [
				"Generating terrain heightmap...",
				"Creating biome boundaries...",
				"Placing ocean and land tiles...",
				"Calculating structure spawn points..."
			]
		},
		{
			"name": "Creating Map Chunks",
			"function": "setup_chunks",
			"weight": 20.0,
			"sub_steps": [
				"Initializing chunk manager...",
				"Loading starting chunks around player...",
				"Setting up chunk activation system...",
				"Registering chunk update callbacks..."
			]
		},
		{
			"name": "Placing Structures",
			"function": "place_structures", 
			"weight": 15.0,
			"sub_steps": [
				"Spawning ports and docks...",
				"Placing villages and towns...",
				"Creating castle fortifications...",
				"Setting up structure interactions..."
			]
		},
		{
			"name": "Spawning Navy Fleet",
			"function": "spawn_navy",
			"weight": 15.0,
			"sub_steps": [
				"Creating navy fleet manager...",
				"Spawning 60 naval units...",
				"Setting up dragons (boss enemies)...",
				"Configuring chunk-based NPC activation...",
				"Registering NPCs with performance manager..."
			]
		},
		{
			"name": "Setting up Player",
			"function": "setup_player",
			"weight": 5.0,
			"sub_steps": [
				"Initializing airship movement system...",
				"Setting up spear attack mechanics...",
				"Creating aim cursor and targeting...",
				"Connecting ship status signals..."
			]
		},
		{
			"name": "Finalizing Scene",
			"function": "finalize_scene",
			"weight": 5.0,
			"sub_steps": [
				"Setting up interaction tooltips...",
				"Initializing parallax background...",
				"Starting cloud animation system...",
				"Configuring web performance monitoring...",
				"Ready to sail!"
			]
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
	var sub_steps = step.get("sub_steps", [])
	
	# Show sub-steps if available
	if sub_steps.size() > 0:
		await show_sub_steps(sub_steps, step_weight)
	
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

func show_sub_steps(sub_steps: Array, total_weight: float):
	"""Display each sub-step with incremental progress"""
	var sub_step_weight = total_weight / sub_steps.size()
	
	for i in range(sub_steps.size()):
		var sub_step_text = sub_steps[i]
		status_label.text = sub_step_text
		
		# Add small progress increment for each sub-step
		target_progress += sub_step_weight
		await animate_progress_to_target()
		
		# Wait a bit to show the sub-step
		await get_tree().create_timer(0.2).timeout
	
	# Subtract the weight we already added
	target_progress -= total_weight

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
	status_label.text = "Generating world terrain..."
	World.initialize_world()
	
	# Show world generation details
	status_label.text = "World generated: " + str(World.get_all_structures().size()) + " structures placed"
	
	await get_tree().create_timer(0.3).timeout

func setup_chunks():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("init_chunk_manager"):
		status_label.text = "Creating chunk management system..."
		main_scene.init_chunk_manager()
		
		# Show chunk details if available
		if main_scene.has_method("get_chunk_manager"):
			var chunk_manager = main_scene.get_chunk_manager()
			if chunk_manager and chunk_manager.has_method("get_loaded_chunk_count"):
				var chunk_count = chunk_manager.get_loaded_chunk_count()
				status_label.text = "Loaded " + str(chunk_count) + " map chunks around player"
	
	await get_tree().create_timer(0.4).timeout

func place_structures():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("init_structures"):
		main_scene.init_structures()
	
	await get_tree().create_timer(0.3).timeout

func spawn_navy():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("init_npcs"):
		status_label.text = "Spawning navy fleet and dragons..."
		main_scene.init_npcs()
		
		# Show NPC spawn details
		var npc_count = World.get_npcs().size()
		var dragon_count = World.get_dragons().size()
		status_label.text = "Spawned " + str(npc_count) + " navy ships and " + str(dragon_count) + " dragons"
	
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
		# Enhanced sky color animation with smooth transitions
		var sky_tween = create_tween()
		sky_tween.set_loops()
		sky_tween.set_ease(Tween.EASE_IN_OUT)
		sky_tween.set_trans(Tween.TRANS_SINE)
		
		# Define color palette for smooth transitions
		var colors = [
			Color(0.7, 0.7, 0.7, 1.0),      # Base gray
			Color(0.8, 0.75, 0.65, 1.0),   # Warm tint
			Color(0.65, 0.7, 0.8, 1.0),    # Cool tint
			Color(0.75, 0.7, 0.75, 1.0),   # Purple tint
			Color(0.7, 0.7, 0.7, 1.0)      # Back to base
		]
		
		# Create smooth color cycling
		for i in range(colors.size() - 1):
			sky_tween.tween_property(background_sprite, "modulate", colors[i + 1], 2.5)

func _process(delta):
	if is_loading and current_progress < target_progress:
		current_progress = move_toward(current_progress, target_progress, delta * 50.0)
		update_progress_display(current_progress)
