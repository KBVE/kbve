class_name CloudManager
extends Node2D

signal clouds_visibility_changed(visible_count: int)

# Cloud pool management
var cloud_pool: Array[CloudSprite] = []
var active_clouds: Array[CloudSprite] = []
var inactive_clouds: Array[CloudSprite] = []

# Cloud spawn settings
const TOTAL_CLOUD_POOL = 40
const MAX_CLOUDS_PER_LAYER = 15
const CLOUD_SPAWN_DISTANCE = 1200.0
const CLOUD_DESPAWN_DISTANCE = 2000.0
const VISIBILITY_CHECK_INTERVAL = 0.3

var visibility_timer: Timer
var camera_ref: Camera2D
var player_ref: Node2D

# Cloud layers with different properties
var layer_configs = {
	"background": {
		"movement_speed": 8.0,  # Much slower movement
		"scale_range": [0.6, 0.9],
		"opacity_range": [0.5, 0.7],
		"tint": Color(0.9, 0.9, 1.0),
		"max_clouds": 8
	},
	"midground": {
		"movement_speed": 15.0,  # Slower movement
		"scale_range": [0.8, 1.2],
		"opacity_range": [0.6, 0.8],
		"tint": Color(0.95, 0.95, 1.0),
		"max_clouds": 6
	},
	"foreground": {
		"movement_speed": 25.0,  # Much slower movement
		"scale_range": [1.0, 1.4],
		"opacity_range": [0.8, 1.0],
		"tint": Color(1.0, 1.0, 1.0),
		"max_clouds": 4
	}
}

class CloudSprite extends Node2D:
	var sprite: Sprite2D
	var visibility_notifier: VisibleOnScreenNotifier2D
	var visibility_enabler: VisibleOnScreenEnabler2D
	var cloud_id: int
	var layer_type: String
	var is_active: bool = false
	var original_position: Vector2
	var movement_speed: float = 0.0
	var movement_direction: Vector2 = Vector2.RIGHT
	var world_bounds: Rect2
	
	func _init(id: int, layer: String):
		cloud_id = id
		layer_type = layer
		setup_cloud()
	
	func setup_cloud():
		# Create sprite
		sprite = Sprite2D.new()
		var cloud_path = "res://assets/clouds/cloud_" + str(cloud_id) + ".png"
		sprite.texture = load(cloud_path)
		sprite.z_index = 2  # Above map (in the sky)
		add_child(sprite)
		
		# Setup visibility notifier with much larger bounds so clouds persist off-screen
		visibility_notifier = VisibleOnScreenNotifier2D.new()
		visibility_notifier.rect = Rect2(Vector2(-800, -600), Vector2(1600, 1200))  # Much larger bounds
		visibility_notifier.screen_exited.connect(_on_screen_exited)
		visibility_notifier.screen_entered.connect(_on_screen_entered)
		add_child(visibility_notifier)
		
		# Don't use VisibleOnScreenEnabler2D - we want clouds to keep moving even when off-screen
		# This ensures they're still there when player moves toward them
	
	func _process(delta):
		# Move cloud continuously regardless of visibility (so they persist off-screen)
		if movement_speed > 0:
			position += movement_direction * movement_speed * delta
			
			# Check if cloud has moved far beyond map bounds - if so, mark for recycling
			var buffer = 800.0
			if position.x > world_bounds.position.x + world_bounds.size.x + buffer:
				mark_for_recycling()
			elif position.x < world_bounds.position.x - buffer:
				mark_for_recycling()
			elif position.y > world_bounds.position.y + world_bounds.size.y + buffer:
				mark_for_recycling()
			elif position.y < world_bounds.position.y - buffer:
				mark_for_recycling()
	
	func mark_for_recycling():
		# Signal to manager that this cloud should be recycled
		get_parent().recycle_cloud(self)
	
	func _on_screen_entered():
		is_active = true
		# Cloud is near visible area
	
	func _on_screen_exited():
		is_active = false
		# Cloud is far from visible area but still processing
	
	func apply_layer_config(config: Dictionary):
		var scale_factor = randf_range(config.scale_range[0], config.scale_range[1])
		var opacity = randf_range(config.opacity_range[0], config.opacity_range[1])
		
		sprite.scale = Vector2(scale_factor, scale_factor)
		sprite.modulate = Color(config.tint.r, config.tint.g, config.tint.b, opacity)
		
		# Set movement properties
		movement_speed = config.movement_speed + randf_range(-10, 10)  # Add some variation
		movement_direction = Vector2(randf_range(0.8, 1.0), randf_range(-0.2, 0.2)).normalized()
	
	func reset_for_reuse(new_position: Vector2):
		position = new_position
		original_position = new_position
		is_active = true  # Make sure it's active when spawned
		visible = true
		z_index = 2  # Above map (in the sky)

func _ready():
	setup_visibility_timer()
	initialize_cloud_pool()

func setup_visibility_timer():
	visibility_timer = Timer.new()
	visibility_timer.wait_time = VISIBILITY_CHECK_INTERVAL
	visibility_timer.timeout.connect(_on_visibility_check)
	visibility_timer.autostart = true
	add_child(visibility_timer)

func initialize_cloud_pool():
	"""Create a large pool of clouds for recycling"""
	# Set world bounds for cloud movement
	var world_size = Vector2(3072, 2304)  # Larger world area for better coverage
	var bounds = Rect2(-world_size / 2, world_size)
	
	# Create the full pool of clouds
	for i in range(TOTAL_CLOUD_POOL):
		var cloud_id = randi_range(1, 10)
		var layer_name = get_random_layer_name()
		var cloud_sprite = CloudSprite.new(cloud_id, layer_name)
		var config = layer_configs[layer_name]
		cloud_sprite.apply_layer_config(config)
		cloud_sprite.world_bounds = bounds
		
		# Position clouds randomly across extended area
		cloud_sprite.position = Vector2(
			randf_range(bounds.position.x - 500, bounds.position.x + bounds.size.x + 500),
			randf_range(bounds.position.y - 500, bounds.position.y + bounds.size.y + 500)
		)
		
		add_child(cloud_sprite)
		cloud_pool.append(cloud_sprite)
		active_clouds.append(cloud_sprite)

func get_random_layer_name() -> String:
	var layer_names = layer_configs.keys()
	return layer_names[randi() % layer_names.size()]

func set_camera_reference(camera: Camera2D):
	camera_ref = camera

func set_player_reference(player: Node2D):
	player_ref = player

func _on_visibility_check():
	"""Periodically manage cloud recycling and spawning"""
	if not camera_ref:
		return
	
	var camera_pos = camera_ref.global_position
	
	# Check clouds around camera and spawn new ones if needed
	ensure_clouds_around_camera(camera_pos)
	
	# Emit visibility change signal
	clouds_visibility_changed.emit(active_clouds.size())

func ensure_clouds_around_camera(camera_pos: Vector2):
	"""Ensure there are enough clouds visible around the camera"""
	var camera_area = Rect2(camera_pos - Vector2(1000, 750), Vector2(2000, 1500))
	var clouds_in_view = 0
	
	for cloud in active_clouds:
		if camera_area.has_point(cloud.position):
			clouds_in_view += 1
	
	# If not enough clouds in view, spawn more
	var target_clouds_in_view = 15
	if clouds_in_view < target_clouds_in_view:
		var clouds_to_spawn = target_clouds_in_view - clouds_in_view
		for i in range(clouds_to_spawn):
			spawn_cloud_near_camera(camera_pos)

func recycle_cloud(cloud: CloudSprite):
	"""Recycle a cloud that has moved too far from the map"""
	if not camera_ref:
		return
	
	# Reposition cloud on the opposite side of camera movement
	var camera_pos = camera_ref.global_position
	var spawn_positions = [
		camera_pos + Vector2(-1200, randf_range(-600, 600)),  # Left side
		camera_pos + Vector2(1200, randf_range(-600, 600)),   # Right side
		camera_pos + Vector2(randf_range(-600, 600), -900),   # Top side
		camera_pos + Vector2(randf_range(-600, 600), 900)     # Bottom side
	]
	
	# Choose random spawn position
	cloud.position = spawn_positions[randi() % spawn_positions.size()]
	
	# Randomize cloud properties for variety
	var new_layer = get_random_layer_name()
	cloud.layer_type = new_layer
	var config = layer_configs[new_layer]
	cloud.apply_layer_config(config)
	
	# Change cloud texture for variety
	cloud.cloud_id = randi_range(1, 10)
	var cloud_path = "res://assets/clouds/cloud_" + str(cloud.cloud_id) + ".png"
	cloud.sprite.texture = load(cloud_path)

func spawn_cloud_near_camera(camera_pos: Vector2):
	"""Spawn a cloud near the camera from available inactive clouds"""
	# Find a cloud that's far from camera to reposition
	var farthest_cloud: CloudSprite = null
	var farthest_distance = 0.0
	
	for cloud in active_clouds:
		var distance = cloud.position.distance_to(camera_pos)
		if distance > farthest_distance:
			farthest_distance = distance
			farthest_cloud = cloud
	
	# If we found a distant cloud, recycle it
	if farthest_cloud and farthest_distance > 1800:
		recycle_cloud(farthest_cloud)

func get_clouds_in_layer(layer_name: String) -> Array[CloudSprite]:
	"""Get all active clouds in a specific layer"""
	var layer_clouds: Array[CloudSprite] = []
	for cloud in active_clouds:
		if cloud.layer_type == layer_name:
			layer_clouds.append(cloud)
	return layer_clouds

func get_visible_cloud_count() -> int:
	var count = 0
	for cloud in active_clouds:
		if cloud.is_active:
			count += 1
	return count

func pause_cloud_system():
	"""Pause all cloud processing for performance"""
	visibility_timer.paused = true
	for cloud in active_clouds:
		cloud.set_process(false)

func resume_cloud_system():
	"""Resume cloud processing"""
	visibility_timer.paused = false
	for cloud in active_clouds:
		if cloud.is_active:
			cloud.set_process(true)

func get_performance_stats() -> Dictionary:
	"""Get performance statistics for debugging"""
	return {
		"total_clouds": cloud_pool.size(),
		"active_clouds": active_clouds.size(),
		"visible_clouds": get_visible_cloud_count()
	}
