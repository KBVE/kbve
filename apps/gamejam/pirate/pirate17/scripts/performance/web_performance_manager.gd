class_name WebPerformanceManager
extends Node

signal performance_changed(performance_level: String)

enum PerformanceLevel {
	HIGH,
	MEDIUM, 
	LOW
}

var current_performance_level: PerformanceLevel = PerformanceLevel.HIGH
var frame_time_samples: Array[float] = []
var max_samples: int = 60
var performance_check_timer: Timer
var last_fps_check: float = 0.0
var target_fps: int = 60
var min_acceptable_fps: int = 30

# Browser-optimized performance settings for each level
var performance_settings = {
	PerformanceLevel.HIGH: {
		"chunk_view_distance": 2,      # Reduced from 3 for browser
		"max_npcs": 18,                # Reduced from 25 for browser
		"particle_density": 0.9,       # Reduced from 1.0 for browser
		"shadow_quality": false,       # Disabled for browser performance
		"animation_quality": 1.0,
		"texture_filtering": true,
		"vsync_enabled": false         # Always disabled for browsers
	},
	PerformanceLevel.MEDIUM: {
		"chunk_view_distance": 2,      # Browser-optimized baseline
		"max_npcs": 15,                # Browser-optimized baseline
		"particle_density": 0.7,
		"shadow_quality": false,       # Always disabled for browser
		"animation_quality": 0.8,
		"texture_filtering": true,
		"vsync_enabled": false         # Always disabled for browser
	},
	PerformanceLevel.LOW: {
		"chunk_view_distance": 1,      # Minimum for smooth gameplay
		"max_npcs": 10,                # Minimum for gameplay interest
		"particle_density": 0.5,
		"shadow_quality": false,       # Always disabled for browser
		"animation_quality": 0.6,
		"texture_filtering": false,
		"vsync_enabled": false         # Always disabled for browser
	}
}

func _ready():
	setup_performance_monitoring()
	detect_initial_performance_level()
	apply_web_optimizations()

func setup_performance_monitoring():
	performance_check_timer = Timer.new()
	performance_check_timer.wait_time = 2.0  # Check every 2 seconds
	performance_check_timer.timeout.connect(_on_performance_check)
	performance_check_timer.autostart = true
	add_child(performance_check_timer)

func detect_initial_performance_level():
	# Web-only game: Start with medium performance as baseline
	current_performance_level = PerformanceLevel.MEDIUM
	apply_performance_settings()
	
	print("WebPerformance: Starting with MEDIUM performance level for browser")

func apply_web_optimizations():
	"""Apply browser optimizations - always enabled for web-only game"""
	# Disable VSync (can cause stuttering in browsers)
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	
	# Set optimized physics tick rate for browsers
	Engine.physics_ticks_per_second = 50  # Reduced from default 60
	
	# Reduce max physics steps per frame for better performance
	Engine.max_physics_steps_per_frame = 4  # Reduced from default 8
	
	# Enable threading if available
	if OS.get_processor_count() > 1:
		RenderingServer.render_loop_enabled = true
	
	# Browser-optimized input handling
	Input.use_accumulated_input = false  # Better for web latency
	
	print("WebPerformance: Applied browser optimizations by default")

func _on_performance_check():
	var current_fps = Engine.get_frames_per_second()
	frame_time_samples.append(1.0 / max(current_fps, 1))
	
	if frame_time_samples.size() > max_samples:
		frame_time_samples.pop_front()
	
	# Calculate average FPS over sample period
	if frame_time_samples.size() >= 30:  # Need at least 30 samples
		var avg_frame_time = 0.0
		for time in frame_time_samples:
			avg_frame_time += time
		avg_frame_time /= frame_time_samples.size()
		
		var avg_fps = 1.0 / avg_frame_time
		
		# Adjust performance level based on FPS
		if avg_fps < 25 and current_performance_level != PerformanceLevel.LOW:
			set_performance_level(PerformanceLevel.LOW)
		elif avg_fps < 40 and current_performance_level == PerformanceLevel.HIGH:
			set_performance_level(PerformanceLevel.MEDIUM)
		elif avg_fps > 50 and current_performance_level == PerformanceLevel.LOW:
			set_performance_level(PerformanceLevel.MEDIUM)
		elif avg_fps > 55 and current_performance_level == PerformanceLevel.MEDIUM:
			set_performance_level(PerformanceLevel.HIGH)

func set_performance_level(level: PerformanceLevel):
	if current_performance_level == level:
		return
	
	var old_level = current_performance_level
	current_performance_level = level
	
	apply_performance_settings()
	
	var level_name = get_performance_level_name(level)
	print("WebPerformance: Changed from ", get_performance_level_name(old_level), " to ", level_name)
	performance_changed.emit(level_name)

func get_performance_level_name(level: PerformanceLevel) -> String:
	match level:
		PerformanceLevel.HIGH:
			return "HIGH"
		PerformanceLevel.MEDIUM:
			return "MEDIUM"
		PerformanceLevel.LOW:
			return "LOW"
		_:
			return "UNKNOWN"

func apply_performance_settings():
	var settings = performance_settings[current_performance_level]
	
	# Apply chunk view distance
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("set_chunk_view_distance"):
		main_scene.set_chunk_view_distance(settings.chunk_view_distance)
	
	# Apply NPC limits
	if main_scene and main_scene.has_method("set_max_npcs"):
		main_scene.set_max_npcs(settings.max_npcs)
	
	# Apply animation quality
	apply_animation_quality(settings.animation_quality)
	
	# Apply texture filtering
	apply_texture_filtering(settings.texture_filtering)
	
	print("WebPerformance: Applied settings for ", get_performance_level_name(current_performance_level), " performance")

func apply_animation_quality(quality: float):
	"""Reduce animation update frequency for lower performance"""
	var npcs = World.get_npcs()
	for npc in npcs:
		if npc and is_instance_valid(npc):
			if npc.has_method("set_animation_quality"):
				npc.set_animation_quality(quality)
			
			# Adjust timer speeds for lower performance
			if quality < 1.0 and npc.movement_timer:
				npc.movement_timer.wait_time *= (2.0 - quality)

func apply_texture_filtering(enabled: bool):
	"""Toggle texture filtering for performance"""
	var viewport = get_viewport()
	if viewport:
		if enabled:
			viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_LINEAR
		else:
			viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST

func get_current_performance_settings() -> Dictionary:
	return performance_settings[current_performance_level]

func force_performance_level(level: PerformanceLevel):
	"""Manually set performance level (for testing or user preference)"""
	set_performance_level(level)
	performance_check_timer.stop()  # Stop automatic adjustment

func resume_automatic_adjustment():
	"""Resume automatic performance adjustment"""
	performance_check_timer.start()

func get_performance_stats() -> Dictionary:
	var current_fps = Engine.get_frames_per_second()
	var avg_frame_time = 0.0
	
	if frame_time_samples.size() > 0:
		for time in frame_time_samples:
			avg_frame_time += time
		avg_frame_time /= frame_time_samples.size()
	
	return {
		"current_fps": current_fps,
		"average_fps": 1.0 / max(avg_frame_time, 0.001),
		"performance_level": get_performance_level_name(current_performance_level),
		"frame_samples": frame_time_samples.size(),
		"physics_fps": Engine.physics_ticks_per_second,
		"max_physics_steps": Engine.max_physics_steps_per_frame
	}