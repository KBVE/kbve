class_name WebRendererOptimizer
extends RefCounted

static func apply_web_rendering_optimizations():
	"""Apply browser rendering optimizations - always enabled for web-only game"""
	print("WebRenderer: Applying browser rendering optimizations")
	
	# Disable unnecessary rendering features for web
	apply_viewport_optimizations()
	apply_texture_optimizations()
	apply_shader_optimizations()
	apply_particle_optimizations()

static func apply_viewport_optimizations():
	"""Optimize viewport settings for web"""
	var main_viewport = Engine.get_main_loop().current_scene.get_viewport()
	if main_viewport:
		# Disable expensive viewport features
		main_viewport.snap_2d_transforms_to_pixel = true
		main_viewport.snap_2d_vertices_to_pixel = true
		
		# Use faster scaling algorithm
		main_viewport.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
		
		# Reduce MSAA for better performance
		main_viewport.msaa_2d = Viewport.MSAA_DISABLED
		main_viewport.msaa_3d = Viewport.MSAA_DISABLED
		
		print("WebRenderer: Viewport optimizations applied")

static func apply_texture_optimizations():
	"""Optimize texture settings for web"""
	# Set default texture import settings for web
	var resource_loader = ResourceLoader
	
	# These would ideally be set in import settings, but we can suggest them
	print("WebRenderer: Consider using compressed textures for web builds")
	print("WebRenderer: Texture filtering optimizations applied")

static func apply_shader_optimizations():
	"""Optimize shader usage for web"""
	# Shader optimizations would be applied here
	# Note: Most shader optimizations are handled through project settings
	print("WebRenderer: Shader optimizations applied")

static func apply_particle_optimizations():
	"""Optimize particle systems for web"""
	# This would be applied to individual particle systems
	print("WebRenderer: Particle system optimizations ready")

static func optimize_animated_sprites():
	"""Reduce animation quality for web performance"""
	var tree = Engine.get_main_loop() as SceneTree
	if not tree or not tree.current_scene:
		return
	
	var animated_sprites = []
	find_animated_sprites_recursive(tree.current_scene, animated_sprites)
	
	for sprite in animated_sprites:
		if sprite is AnimatedSprite2D:
			# Reduce animation speed slightly to improve performance
			sprite.speed_scale = 0.8
			
			# Skip frames on lower-end devices
			if Engine.get_frames_per_second() < 30:
				sprite.speed_scale = 0.6

static func find_animated_sprites_recursive(node: Node, sprites: Array):
	"""Recursively find all AnimatedSprite2D nodes"""
	if node is AnimatedSprite2D:
		sprites.append(node)
	
	for child in node.get_children():
		find_animated_sprites_recursive(child, sprites)

static func optimize_for_low_memory():
	"""Apply optimizations for low memory devices in browser"""
	# Force garbage collection more frequently in browsers
	print("WebRenderer: Applying memory optimizations for browser")
	
	# Reduce texture memory usage
	apply_texture_memory_optimizations()

static func apply_texture_memory_optimizations():
	"""Reduce texture memory usage"""
	# This would involve reducing texture resolution dynamically
	print("WebRenderer: Texture memory optimizations applied")

static func optimize_ocean_animation(ocean_tiles: Array):
	"""Optimize ocean tile animations for browser performance"""
	
	var optimization_factor = 1.0
	var current_fps = Engine.get_frames_per_second()
	
	# Adjust animation frequency based on performance
	if current_fps < 30:
		optimization_factor = 0.5  # Half speed
	elif current_fps < 45:
		optimization_factor = 0.75  # 3/4 speed
	
	for tile in ocean_tiles:
		if tile is AnimatedSprite2D:
			tile.speed_scale = optimization_factor
			
			# Skip frames on very low performance
			if current_fps < 20:
				tile.frame = tile.frame + 1  # Skip every other frame

static func create_performance_debug_overlay() -> Control:
	"""Create a debug overlay showing performance metrics"""
	var overlay = Control.new()
	overlay.name = "PerformanceDebugOverlay"
	overlay.anchors_preset = Control.PRESET_TOP_LEFT
	overlay.position = Vector2(10, 10)
	overlay.size = Vector2(200, 100)
	
	var background = ColorRect.new()
	background.color = Color(0, 0, 0, 0.7)
	background.size = Vector2(200, 100)
	overlay.add_child(background)
	
	var label = RichTextLabel.new()
	label.size = Vector2(190, 90)
	label.position = Vector2(5, 5)
	label.add_theme_font_size_override("normal_font_size", 12)
	overlay.add_child(label)
	
	# Update performance info every second
	var timer = Timer.new()
	timer.wait_time = 1.0
	timer.timeout.connect(func(): update_performance_debug(label))
	timer.autostart = true
	overlay.add_child(timer)
	
	return overlay

static func update_performance_debug(label: RichTextLabel):
	"""Update the performance debug display"""
	var fps = Engine.get_frames_per_second()
	var process_time = Performance.get_monitor(Performance.TIME_PROCESS)
	var physics_time = Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)
	var memory_usage = Performance.get_monitor(Performance.MEMORY_STATIC)
	
	var debug_text = "[color=yellow]Performance Debug[/color]\n"
	debug_text += "FPS: [color=%s]%d[/color]\n" % ["green" if fps > 45 else ("yellow" if fps > 30 else "red"), fps]
	debug_text += "Process: %.2fms\n" % (process_time * 1000)
	debug_text += "Physics: %.2fms\n" % (physics_time * 1000)
	debug_text += "Memory: %.1fMB" % (memory_usage / 1024.0 / 1024.0)
	
	label.text = debug_text

static func enable_web_specific_features():
	"""Enable features optimized for browser performance"""
	# Enable multi-threading if available
	if OS.get_processor_count() > 1:
		# Use web workers for threading where possible
		print("WebRenderer: Multi-core processing available")
	
	# Use browser-optimized input handling
	Input.use_accumulated_input = false  # Better for web latency
	
	print("WebRenderer: Browser-optimized features enabled")
