extends Control

# Smooth transition scene that handles fading between scenes
var fade_overlay: ColorRect
var target_scene: String = ""
var fade_duration: float = 1.2

func _ready():
	# Setup full screen overlay
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	
	# Get target scene from meta
	target_scene = get_tree().get_meta("transition_target", "")
	
	# Setup sky background first
	setup_sky_background()
	
	# Make sure CloudManager is visible and active during transition
	setup_clouds_during_transition()
	
	# Create black fade overlay on top
	fade_overlay = ColorRect.new()
	fade_overlay.color = Color.BLACK
	fade_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	fade_overlay.modulate.a = 0.0  # Start transparent
	add_child(fade_overlay)
	
	# Start transition immediately
	start_transition()

func setup_sky_background():
	"""Setup the sky background to maintain visual continuity"""
	var sky_texture = load("res://assets/background/sky.png")
	if not sky_texture:
		print("Transition: WARNING - Could not load sky.png")
		return
	
	# Create sky background sprite
	var sky_sprite = Sprite2D.new()
	sky_sprite.texture = sky_texture
	sky_sprite.z_index = -2  # Behind clouds (-1) and everything else
	
	# Get screen size for scaling
	var screen_size = get_viewport().get_visible_rect().size
	var texture_size = sky_texture.get_size()
	
	# Calculate scale to cover entire screen
	var scale_x = screen_size.x / texture_size.x
	var scale_y = screen_size.y / texture_size.y
	
	# Position and scale the sky
	sky_sprite.position = screen_size / 2
	sky_sprite.scale = Vector2(scale_x, scale_y)
	
	add_child(sky_sprite)
	print("Transition: Sky background added for continuity")

func setup_clouds_during_transition():
	"""Ensure clouds remain visible and active during transition"""
	if CloudManager:
		# CloudManager is an autoload singleton, so it's always running
		CloudManager.resume_cloud_system()
		
		# No need to add to scene - autoload is always present
		# Just ensure it continues processing
		print("Transition: CloudManager singleton active during transition")

func start_transition():
	"""Perform the fade in, wait, then fade out to target scene with sky and clouds visible"""
	# Fade in to semi-transparent (allowing sky and clouds to show through clearly)
	var fade_in_tween = create_tween()
	fade_in_tween.set_ease(Tween.EASE_IN_OUT)
	fade_in_tween.set_trans(Tween.TRANS_CUBIC)
	fade_in_tween.tween_property(fade_overlay, "modulate:a", 0.6, fade_duration * 0.4)  # 60% opacity - sky and clouds clearly visible
	fade_in_tween.tween_interval(fade_duration * 0.2)  # 20% hold time - sky and clouds moving in background
	fade_in_tween.tween_callback(change_to_target_scene)
	fade_in_tween.tween_property(fade_overlay, "modulate:a", 0.0, fade_duration * 0.4)  # 40% of time for fade out

func change_to_target_scene():
	"""Change to the target scene while screen is black"""
	if target_scene != "":
		print("Transition: Changing to scene: ", target_scene)
		
		# If transitioning to main scene, use loading screen
		if target_scene == "res://scenes/main.tscn":
			show_loading_screen_then_main()
		else:
			get_tree().change_scene_to_file(target_scene)
	else:
		print("ERROR: No target scene set for transition")

func show_loading_screen_then_main():
	"""Show loading screen, then load main scene with progress tracking"""
	# Get the tree reference before scene change
	var tree = get_tree()
	if not tree:
		print("ERROR: No scene tree available for transition")
		return
	
	# Create and add loading screen BEFORE changing scenes
	var loading_screen_scene = preload("res://scenes/loading_screen.tscn")
	var loading_screen = loading_screen_scene.instantiate()
	
	# Create a CanvasLayer to ensure loading screen stays on top during scene change
	var canvas_layer = CanvasLayer.new()
	canvas_layer.layer = 100
	tree.root.add_child(canvas_layer)
	canvas_layer.add_child(loading_screen)
	
	# Connect loading complete signal
	loading_screen.loading_complete.connect(func(): 
		canvas_layer.queue_free()
		_on_loading_complete()
	)
	
	# Now change to the main scene
	tree.change_scene_to_file("res://scenes/main.tscn")
	
	# Wait a frame for the scene to be ready
	await tree.process_frame
	
	# Start the loading process after scene is ready
	loading_screen.start_loading()

func _on_loading_complete():
	"""Called when loading screen finishes"""
	print("Transition: Loading complete, game ready to play")

# Static method to start a transition to a specific scene
static func transition_to_scene(scene_path: String):
	"""Start a transition to the specified scene"""
	var tree = Engine.get_main_loop() as SceneTree
	if not tree or not tree.current_scene:
		print("ERROR: Cannot transition - no scene tree or current scene available")
		return
	
	var transition_scene = preload("res://scenes/transition.tscn")
	var transition_instance = transition_scene.instantiate()
	transition_instance.target_scene = scene_path
	
	# Add to the scene tree
	var scene_parent = tree.current_scene.get_parent()
	if not scene_parent:
		print("ERROR: Cannot transition - current scene has no parent")
		return
	
	scene_parent.add_child(transition_instance)
	
	# Remove the current scene after a brief delay to let transition start
	var current_scene = tree.current_scene
	var remove_timer = Timer.new()
	remove_timer.wait_time = 0.1
	remove_timer.timeout.connect(func(): 
		if current_scene and is_instance_valid(current_scene):
			current_scene.queue_free()
	)
	remove_timer.autostart = true
	transition_instance.add_child(remove_timer)
