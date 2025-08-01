extends Node2D

const Movement = preload("res://scripts/world/movement.gd")
const BorderSlicer = preload("res://scripts/ui/border_slicer.gd")
const ChunkManager = preload("res://scripts/world/chunk.gd")

@onready var camera = $Camera2D
@onready var map_container = $MapContainer
@onready var player = $Player
@onready var player_ship = $Player/PlayerShip
@onready var path_line = $PathVisualizer/PathLine
@onready var path_visualizer = $PathVisualizer
@onready var target_highlight = $PathVisualizer/TargetHighlight
@onready var player_info_ui: AirshipStatsUI = $UI/AirshipStats

const TILE_SIZE = 32
var tile_sprites = {}
var player_movement: Movement.MoveComponent
var dash_lines: Array[Line2D] = []
var npc_container: Node2D
var structure_container: Node2D
var interaction_tooltip: StructureInteractionTooltip
var pending_movement: Vector2i
var is_waiting_for_rotation: bool = false
var parallax_bg: ParallaxBackground
var total_distance_traveled: float = 0.0
var last_player_position: Vector2 = Vector2.ZERO
const ENERGY_COST_DISTANCE: float = 128.0
var structure_interior_overlay: StructureInteriorOverlay
var settings_button: Button
var ocean_tiles: Array[AnimatedSprite2D] = []
var spear_pool: SpearPool
var aim_cursor: Node2D
var aim_line: Line2D
var navy_fleet_manager: NavyFleetManager
var web_performance_manager: WebPerformanceManager
var airship_ammo_ui: AirshipAmmoUI

var chunk_manager: ChunkManager
var debug_label: Label
var battle_scene: Node2D
var battle_check_timer: Timer
var battle_cooldown: float = 5.0
var last_battle_time: float = 0.0
var battle_check_accumulator: float = 0.0
var battle_check_interval: float = 1.0  # Check every 1 second for web performance

func _ready():
	add_to_group("main_scene")
	set_process_unhandled_input(true)
	
func init_basic_systems():
	var WebRendererOptimizer = preload("res://scripts/performance/web_renderer_optimizer.gd")
	WebRendererOptimizer.apply_web_rendering_optimizations()

func init_chunk_manager():
	setup_chunk_manager()

func init_structures():
	render_structures()

func init_npcs():
	setup_npc_container()
	# Increase NPC count since we now have chunk-based activation
	var npc_count = 60  # 4x more NPCs, but only nearby ones are active
	print("Main: Spawning ", npc_count, " NPCs with chunk-based activation")
	spawn_npcs_with_count(npc_count)

func spawn_npcs_with_count(count: int):
	World.spawn_npcs(count)
	
	var npc_list = World.get_npcs()
	var dragon_list = World.get_dragons()
	print("Retrieved ", npc_list.size(), " NPCs and ", dragon_list.size(), " dragons from World")
	
	setup_navy_fleet_manager()
	
	# Setup regular NPCs
	for npc in npc_list:
		if npc and is_instance_valid(npc) and npc.has_method("enable_web_optimizations"):
			npc.enable_web_optimizations()
		
		# Register NPC with chunk manager
		if chunk_manager:
			chunk_manager.register_npc(npc)
	
	# Setup dragons
	for dragon in dragon_list:
		if dragon and is_instance_valid(dragon) and dragon.has_method("enable_web_optimizations"):
			dragon.enable_web_optimizations()
		
		# Register dragon with chunk manager
		if chunk_manager:
			chunk_manager.register_npc(dragon)
	
	# Add all entities to scene
	for npc in npc_list:
		npc_container.add_child(npc)
		npc.update_position_after_scene_ready()
		
		# Initially deactivate all NPCs (they'll be activated based on player position)
		if npc and is_instance_valid(npc):
			npc.deactivate()
	
	for dragon in dragon_list:
		npc_container.add_child(dragon)
		dragon.update_position_after_scene_ready()
		
		# Keep dragons always active (they're special boss enemies)
		if dragon and is_instance_valid(dragon):
			dragon.activate()  # Make sure dragons stay active
			# Add dragons to active list manually since they bypass chunk activation
			if chunk_manager and not dragon in chunk_manager.active_npcs:
				chunk_manager.active_npcs.append(dragon)

func init_player_systems():
	"""Initialize player movement and related systems"""
	setup_player_movement()
	setup_spear_pool()
	setup_aim_cursor()
	connect_movement_signals()
	connect_ship_signals()

func finalize_initialization():
	setup_target_highlight()
	setup_interaction_system()
	setup_parallax_background()
	setup_cloud_manager()
	setup_structure_interior_overlay()
	setup_settings_button()
	setup_airship_ammo_ui()
	setup_web_performance_manager()
	setup_battle_system()

func setup_web_performance_manager():
	web_performance_manager = preload("res://scripts/performance/web_performance_manager.gd").new()
	web_performance_manager.name = "WebPerformanceManager"
	add_child(web_performance_manager)
	web_performance_manager.performance_changed.connect(_on_performance_changed)

func _on_performance_changed(performance_level: String):
	if performance_level == "LOW":
		show_performance_notification("Performance optimized for smoother gameplay")
		# Increase battle check interval for low-end devices
		battle_check_interval = 1.5
	elif performance_level == "MEDIUM":
		battle_check_interval = 1.0
	else:  # HIGH
		battle_check_interval = 0.75

func show_performance_notification(message: String):
	var notification = Label.new()
	notification.text = message
	notification.add_theme_font_size_override("font_size", 14)
	notification.add_theme_color_override("font_color", Color.YELLOW)
	notification.add_theme_color_override("font_shadow_color", Color.BLACK)
	notification.add_theme_constant_override("shadow_offset_x", 1)
	notification.add_theme_constant_override("shadow_offset_y", 1)
	notification.position = Vector2(20, 50)
	notification.z_index = 1000
	
	add_child(notification)
	
	# Fade out after 3 seconds
	var tween = create_tween()
	tween.tween_delay(3.0)
	tween.tween_property(notification, "modulate:a", 0.0, 1.0)
	tween.tween_callback(notification.queue_free)

func set_chunk_view_distance(distance: int):
	"""Set chunk view distance for performance scaling"""
	if chunk_manager:
		chunk_manager.set_view_distance(distance)

func set_max_npcs(max_count: int):
	"""Limit NPC count for performance"""
	var current_npcs = World.get_npcs()
	if current_npcs.size() > max_count:
		for i in range(max_count, current_npcs.size()):
			if current_npcs[i] and is_instance_valid(current_npcs[i]):
				current_npcs[i].queue_free()
		print("Reduced NPC count to ", max_count, " for performance")

func get_web_performance_manager() -> WebPerformanceManager:
	"""Get the web performance manager instance"""
	return web_performance_manager

func get_chunk_manager():
	"""Get the chunk manager instance for loading screen info"""
	return chunk_manager

func setup_target_highlight():
	var border_texture = BorderSlicer.get_border_texture_by_position(2, 0)
	if border_texture:
		target_highlight.texture = border_texture
		target_highlight.modulate = Color(0.8, 1.0, 1.0, 0.9)
		print("Target highlight border texture set")
	else:
		print("Failed to load border texture")

func setup_chunk_manager():
	chunk_manager = ChunkManager.new()
	chunk_manager.setup(Map, World, map_container)
	
	var start_position = Vector2i(50, 50)
	if Player:
		start_position = Player.current_position
	
	chunk_manager.update_chunks_around_player(start_position)
	print("Chunk manager initialized with ", chunk_manager.get_loaded_chunk_count(), " chunks")

func setup_player_movement():
	var start_position = Vector2i(50, 50)
	if Player:
		start_position = Player.current_position
	
	player_movement = Movement.MoveComponent.new(player, start_position)
	camera.position = player.position
	
	camera.position = player.position
	
	print("Player movement initialized at position: ", start_position)


func create_tile_sprite(x: int, y: int, color_hex: String):
	var tile_position = Vector2(x * TILE_SIZE, y * TILE_SIZE)
	
	var ocean_color = Map.tile_colors["ocean"]
	if x < 5 and y < 5:
		print("Tile at ", x, ",", y, " has color: '", color_hex, "' vs ocean: '", ocean_color, "' match: ", color_hex == ocean_color)
	
	if color_hex == ocean_color:
		var ocean_tile = create_animated_ocean_tile()
		ocean_tile.position = tile_position
		map_container.add_child(ocean_tile)
		tile_sprites[Vector2i(x, y)] = ocean_tile
		print("✓ Created animated OCEAN tile at ", x, ",", y)
		return
	
	var tile = ColorRect.new()
	tile.size = Vector2(TILE_SIZE + 1, TILE_SIZE + 1)  # Slightly larger to eliminate gaps
	tile.position = tile_position
	tile.color = Color(color_hex)
	
	map_container.add_child(tile)
	tile_sprites[Vector2i(x, y)] = tile
	
	if color_hex == "#1E3A8A":
		print("⚠ Created blue ColorRect at ", x, ",", y, " - this should have been ocean!")

func create_animated_ocean_tile() -> AnimatedSprite2D:
	var ocean_sprite = AnimatedSprite2D.new()
	
	var spritesheet = load("res://assets/ocean/water_spritesheet_16x16_5frames.png")
	
	var sprite_frames = SpriteFrames.new()
	sprite_frames.add_animation("wave")
	
	var frame_width = 16
	var frame_height = 16
	
	for i in range(5):
		var atlas_texture = AtlasTexture.new()
		atlas_texture.atlas = spritesheet
		atlas_texture.region = Rect2(i * frame_width, 0, frame_width, frame_height)
		sprite_frames.add_frame("wave", atlas_texture)
	
	sprite_frames.set_animation_speed("wave", 8.0)
	sprite_frames.set_animation_loop("wave", true)
	
	ocean_sprite.sprite_frames = sprite_frames
	ocean_sprite.animation = "wave"
	ocean_sprite.play()
	
	ocean_sprite.scale = Vector2(2.0, 2.0)
	
	ocean_sprite.speed_scale = randf_range(0.8, 1.2)
	
	ocean_tiles.append(ocean_sprite)
	
	return ocean_sprite

func _input(event):
	if event is InputEventKey and event.keycode == KEY_SPACE:
		# Check if any UI elements have focus that should block spacebar
		if is_ui_blocking_input():
			return
			
		if event.pressed and not event.echo:
			show_aim_cursor()
			get_viewport().set_input_as_handled()  # Consume the event
		elif not event.pressed:
			hide_aim_cursor()
			# Use ammo UI's debounce system for consistent cooldown
			if airship_ammo_ui:
				airship_ammo_ui.try_manual_fire()
			else:
				fire_player_spear()  # Fallback if ammo UI not available
			get_viewport().set_input_as_handled()  # Consume the event
		return
	
	if event is InputEventKey and event.pressed:
		if not player_movement:
			print("DEBUG: Key input ignored - player_movement is null")
			return
		
		var current_pos = player_movement.get_current_position()
		var new_pos = current_pos
		
		match event.keycode:
			KEY_W, KEY_UP:
				new_pos.y -= 1
			KEY_S, KEY_DOWN:
				new_pos.y += 1
			KEY_A, KEY_LEFT:
				new_pos.x -= 1
			KEY_D, KEY_RIGHT:
				new_pos.x += 1
			KEY_F:
				if interaction_tooltip and interaction_tooltip.visible:
					interaction_tooltip.handle_interaction_key()
				return
			KEY_ESCAPE:
				open_settings_dialogue()
				return
			KEY_B:
				# Debug: Force battle with nearest NPC
				_force_battle_with_nearest_npc()
				return
		
		if new_pos != current_pos:
			initiate_movement_with_rotation(current_pos, new_pos, true)
	
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if is_mouse_over_blocking_ui():
			return
			
		if not player_movement:
			print("DEBUG: Mouse input ignored - player_movement is null")
			return
		var mouse_world_pos = get_global_mouse_position()
		var grid_pos = Movement.get_grid_position(mouse_world_pos)
		var current_pos = player_movement.get_current_position()
		
		initiate_movement_with_rotation(current_pos, grid_pos, false)

func is_mouse_over_blocking_ui() -> bool:
	var viewport = get_viewport()
	if not viewport:
		return false
		
	var mouse_pos = viewport.get_mouse_position()
	
	if viewport.gui_is_dragging():
		return true
	
	if settings_button and settings_button.visible:
		var button_rect = settings_button.get_global_rect()
		button_rect = button_rect.grow(5)
		if button_rect.has_point(mouse_pos):
			print("Mouse over settings button - blocking movement")
			return true
	
	var settings_layer = get_node_or_null("SettingsLayer")
	if settings_layer and settings_layer.visible and settings_layer.get_child_count() > 0:
		print("Settings menu open - blocking all input")
		return true
	
	if structure_interior_overlay and structure_interior_overlay.visible:
		print("Structure interior overlay visible - blocking all input")
		return true
	
	if interaction_tooltip and interaction_tooltip.visible:
		var tooltip_rect = Rect2(interaction_tooltip.global_position, interaction_tooltip.size)
		if tooltip_rect.has_point(mouse_pos):
			print("Mouse over interaction tooltip - blocking movement")
			return true
	
	return false

func initiate_movement_with_rotation(from: Vector2i, to: Vector2i, immediate: bool):
	if is_waiting_for_rotation:
		is_waiting_for_rotation = false
		pending_movement = Vector2i.ZERO
		if player_ship and player_ship.rotation_tween:
			player_ship.rotation_tween.kill()
			player_ship.is_rotating = false
	
	if not Movement.is_valid_move(from, to):
		return
	
	if player_ship and not immediate:
		var movement_vector = to - from
		if movement_vector != Vector2i.ZERO:
			var target_angle = atan2(movement_vector.y, movement_vector.x) + PI / 2
			var current_angle = player_ship.sprite.rotation if player_ship.sprite else 0.0
			
			var angle_diff = abs(target_angle - current_angle)
			while angle_diff > PI:
				angle_diff = abs(angle_diff - 2 * PI)
			
			if angle_diff > PI / 36:
				is_waiting_for_rotation = true
				pending_movement = to
				player_ship.update_direction_from_movement(from, to)
				return
	
	player_movement.move_to(to, immediate)
	if player_ship and immediate:
		player_ship.update_direction_from_movement(from, to)

func _process(delta):
	if player_movement:
		player_movement.process_movement(delta)
		camera.position = player.position
		
		if chunk_manager:
			var player_grid_pos = Movement.get_grid_position(player.position)
			chunk_manager.update_chunks_around_player(player_grid_pos)
			chunk_manager.update_ocean_animation(delta)
			
			# Update NPC activation based on player position
			var player_chunk_pos = chunk_manager.world_to_chunk_position(player_grid_pos)
			chunk_manager.update_npc_activation(player_chunk_pos)
			
			# Update debug info
			update_debug_info()
		
		update_movement_path()
		track_movement_distance()
	
	# Web-optimized battle proximity checking using accumulator pattern
	if battle_scene and not battle_scene.visible:
		battle_check_accumulator += delta
		if battle_check_accumulator >= battle_check_interval:
			battle_check_accumulator = 0.0
			_check_npc_proximity_for_battle()
	
	check_structure_interactions()
	update_parallax_effects()
	if Player:
		Player.update_play_time(delta)

func connect_movement_signals():
	player_movement.movement_started.connect(_on_movement_started)
	player_movement.movement_finished.connect(_on_movement_finished)

func connect_ship_signals():
	if player_ship:
		player_ship.rotation_completed.connect(_on_ship_rotation_completed)

func _on_movement_started(entity: Node2D, from: Vector2i, to: Vector2i):
	if entity == player:
		show_movement_path(from, to)
		update_ship_wind_effects(true)

func _on_ship_rotation_completed():
	if is_waiting_for_rotation and pending_movement != Vector2i.ZERO:
		is_waiting_for_rotation = false
		player_movement.move_to(pending_movement, false)
		pending_movement = Vector2i.ZERO

func _on_movement_finished(entity: Node2D, at: Vector2i):
	if entity == player:
		hide_movement_path()
		update_ship_wind_effects(false)
		if Player:
			Player.update_position(at)

func show_movement_path(from: Vector2i, to: Vector2i):
	var start_pos = Movement.get_world_position(from)
	var end_pos = Movement.get_world_position(to)
	
	path_line.clear_points()
	create_dotted_line(start_pos, end_pos)
	
	show_target_border(to)

func show_target_border(grid_pos: Vector2i):
	var world_pos = Movement.get_world_position(grid_pos)
	target_highlight.position = world_pos - Vector2(24, 24)
	target_highlight.visible = true
	
	stop_border_animation()
	start_border_animation()

func start_border_animation():
	var tween = create_tween()
	tween.set_loops()
	tween.set_ease(Tween.EASE_IN_OUT)
	tween.set_trans(Tween.TRANS_BACK)
	
	target_highlight.scale = Vector2.ONE
	
	tween.tween_property(target_highlight, "scale", Vector2(1.3, 1.3), 0.5)
	tween.tween_property(target_highlight, "scale", Vector2(0.7, 0.7), 0.5)

func stop_border_animation():
	var tweens = get_tree().get_processed_tweens()
	for tween in tweens:
		if tween.is_valid():
			tween.kill()
	target_highlight.scale = Vector2.ONE

func create_dotted_line(start: Vector2, end: Vector2):
	clear_dash_lines()
	
	var direction = (end - start).normalized()
	var distance = start.distance_to(end)
	var dash_length = 10.0
	var gap_length = 12.0
	var current_distance = 0.0
	
	while current_distance < distance:
		var dash_start = start + direction * current_distance
		var dash_end_distance = min(current_distance + dash_length, distance)
		var dash_end = start + direction * dash_end_distance
		
		var dash_line = Line2D.new()
		dash_line.width = 3.0
		dash_line.default_color = Color(0.8, 0.2, 0.2, 0.8)
		dash_line.add_point(dash_start)
		dash_line.add_point(dash_end)
		
		path_visualizer.add_child(dash_line)
		dash_lines.append(dash_line)
		
		current_distance += dash_length + gap_length

func clear_dash_lines():
	for dash_line in dash_lines:
		if dash_line and is_instance_valid(dash_line):
			dash_line.queue_free()
	dash_lines.clear()

func hide_movement_path():
	path_line.clear_points()
	clear_dash_lines()
	stop_border_animation()
	target_highlight.visible = false

func update_movement_path():
	if player_movement and player_movement.is_currently_moving():
		var current_pos = player.position
		var target_pos = Movement.get_world_position(player_movement.get_target_position())
		
		path_line.clear_points()
		create_dotted_line(current_pos, target_pos)


func setup_npc_container():
	npc_container = Node2D.new()
	npc_container.name = "NPCs"
	add_child(npc_container)

func setup_spear_pool():
	spear_pool = preload("res://scripts/entities/spear_pool.gd").new()
	add_child(spear_pool)
	
	var fireball_pool = preload("res://scripts/entities/fireball_pool.gd").new()
	fireball_pool.name = "FireballPool"
	add_child(fireball_pool)
	
	var regen_manager = preload("res://scripts/entities/regeneration_manager.gd").new()
	regen_manager.name = "RegenerationManager"
	add_child(regen_manager)
	
	# Setup debug label after pools
	setup_debug_label()

func setup_debug_label():
	"""Create a debug label to show NPC stats"""
	debug_label = Label.new()
	debug_label.name = "DebugLabel"
	debug_label.position = Vector2(10, 10)
	debug_label.add_theme_font_size_override("font_size", 14)
	debug_label.modulate = Color(1, 1, 1, 0.8)
	
	# Add shadow for better readability
	debug_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	debug_label.add_theme_constant_override("shadow_offset_x", 1)
	debug_label.add_theme_constant_override("shadow_offset_y", 1)
	
	# Add to UI layer
	if has_node("UI"):
		$UI.add_child(debug_label)
	else:
		add_child(debug_label)

func update_debug_info():
	"""Update debug display with NPC stats"""
	if debug_label and chunk_manager:
		var active_npcs = chunk_manager.get_active_npc_count()
		var total_npcs = chunk_manager.get_total_npc_count()
		var chunks_loaded = chunk_manager.get_loaded_chunk_count()
		var fps = Engine.get_frames_per_second()
		
		# Include both NPCs and dragons in the count
		var world_npcs = World.get_npcs().size()
		var world_dragons = World.get_dragons().size()
		var active_dragons = 0
		for dragon in World.get_dragons():
			if dragon and is_instance_valid(dragon) and dragon.is_active and dragon.visible:
				active_dragons += 1
		
		debug_label.text = "Active: %d/%d\nNPCs: %d Dragons: %d/%d\nChunks: %d FPS: %d" % [active_npcs, total_npcs, world_npcs, active_dragons, world_dragons, chunks_loaded, fps]

func is_ui_blocking_input() -> bool:
	"""Check if any UI elements should block spacebar input"""
	# Check if settings menu is open
	var settings_layer = get_node_or_null("SettingsLayer")
	if settings_layer and settings_layer.visible:
		return true
	
	# Check if any UI control has focus
	var focused_control = get_viewport().gui_get_focus_owner()
	if focused_control:
		# Allow spacebar if it's just the ammo UI checkbox (auto-fire toggle)
		if airship_ammo_ui and focused_control == airship_ammo_ui.auto_fire_toggle:
			return false
		# Block for other UI controls
		return true
	
	return false

func setup_aim_cursor():
	aim_cursor = Node2D.new()
	aim_cursor.name = "AimCursor"
	aim_cursor.z_index = 20
	aim_cursor.visible = false
	
	aim_line = Line2D.new()
	aim_line.width = 2.0
	aim_line.default_color = Color(1.0, 0.3, 0.3, 0.7)
	aim_line.add_point(Vector2.ZERO)
	aim_line.add_point(Vector2.ZERO)
	aim_cursor.add_child(aim_line)
	
	var target_circle = Node2D.new()
	target_circle.name = "TargetCircle"
	target_circle.z_index = 1
	target_circle.set_script(GDScript.new())
	target_circle.get_script().source_code = """
extends Node2D

func _draw():
	var radius = 20.0
	var color = Color(1.0, 0.3, 0.3, 0.8)
	var width = 2.0
	
	draw_arc(Vector2.ZERO, radius, 0, TAU, 32, color, width)
	
	draw_line(Vector2(-radius - 5, 0), Vector2(-radius + 10, 0), color, width)
	draw_line(Vector2(radius - 10, 0), Vector2(radius + 5, 0), color, width)
	draw_line(Vector2(0, -radius - 5), Vector2(0, -radius + 10), color, width)
	draw_line(Vector2(0, radius - 10), Vector2(0, radius + 5), color, width)
"""
	aim_cursor.add_child(target_circle)
	
	add_child(aim_cursor)

func setup_navy_fleet_manager():
	navy_fleet_manager = preload("res://scenes/entities/ships/navy/navy_fleet_manager.gd").new()
	navy_fleet_manager.name = "NavyFleetManager"
	add_child(navy_fleet_manager)
	
	navy_fleet_manager.fleet_alert.connect(_on_fleet_alert_changed)
	navy_fleet_manager.formation_created.connect(_on_formation_created)
	
	print("Navy Fleet Manager initialized")

func _on_fleet_alert_changed(alert_level: String):
	print("Fleet Alert Level changed to: ", alert_level)

func _on_formation_created(leader: NavyAI, members: Array[NavyAI]):
	print("Formation created with leader and ", members.size(), " members")

func get_fleet_status() -> Dictionary:
	if navy_fleet_manager:
		return navy_fleet_manager.get_fleet_status()
	return {}

func debug_fleet_info():
	if navy_fleet_manager:
		var status = navy_fleet_manager.get_fleet_status()
		print("=== FLEET STATUS ===")
		for key in status.keys():
			print(key, ": ", status[key])
		print("===================")

func spawn_npcs():
	"""Legacy spawn function - now calls the optimized version"""
	var npc_count = 15  # Browser-optimized default count
	spawn_npcs_with_count(npc_count)
	
	# Handle dragons separately
	var dragons = World.get_dragons()
	print("Retrieved ", dragons.size(), " dragons from World")
	
	for dragon in dragons:
		if dragon and is_instance_valid(dragon):
			npc_container.add_child(dragon)
			dragon.update_position_after_scene_ready()
			print("Added Dragon to scene at world position: ", dragon.position)

func get_player_position() -> Vector2i:
	if player_movement:
		return player_movement.get_current_position()
	else:
		print("WARNING: get_player_position called but player_movement is null")
	return Vector2i(50, 50)

func render_structures():
	structure_container = Node2D.new()
	structure_container.name = "Structures"
	structure_container.z_index = 5
	add_child(structure_container)
	
	var structures = World.get_all_structures()
	print("Rendering ", structures.size(), " structures on map")
	
	for structure in structures:
		create_structure_visual(structure)

func create_structure_visual(structure):
	var structure_visual = Node2D.new()
	structure_visual.name = structure.name
	structure_visual.z_index = structure.visual_data.get("render_priority", 5)
	
	var center_x = structure.grid_position.x + (structure.size.x / 2.0) - 0.5
	var center_y = structure.grid_position.y + (structure.size.y / 2.0) - 0.5
	structure_visual.position = Vector2(center_x * TILE_SIZE, center_y * TILE_SIZE)
	
	for x in range(structure.size.x):
		for y in range(structure.size.y):
			var tile_bg = ColorRect.new()
			tile_bg.size = Vector2(TILE_SIZE, TILE_SIZE)
			tile_bg.position = Vector2(
				(structure.grid_position.x + x - center_x) * TILE_SIZE,
				(structure.grid_position.y + y - center_y) * TILE_SIZE
			)
			tile_bg.color = structure.visual_data.get("color", Color.GRAY)
			tile_bg.color.a = 0.8
			structure_visual.add_child(tile_bg)
	
	# Check if structure has a custom icon
	var icon_path = StructurePool.get_structure_icon_path(structure.type)
	if icon_path != "":
		# Use TextureRect for custom icons
		var icon_texture = TextureRect.new()
		icon_texture.texture = load(icon_path)
		icon_texture.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
		icon_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon_texture.position = Vector2(-16, -16)
		icon_texture.size = Vector2(32, 32)
		structure_visual.add_child(icon_texture)
	else:
		# Use Label for emoji symbols
		var icon_label = Label.new()
		icon_label.text = structure.visual_data.get("symbol", "🏗")
		icon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		icon_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		icon_label.add_theme_font_size_override("font_size", 20)
		icon_label.position = Vector2(-16, -16)
		icon_label.size = Vector2(32, 32)
		structure_visual.add_child(icon_label)
	
	var structure_badge = FantasyStructureBadge.new()
	structure_badge.structure_name = structure.name
	structure_badge.structure_type = StructurePool.StructureType.keys()[structure.type]
	structure_badge.set_badge_texture_by_type(structure.type)
	structure_badge.position = Vector2(-40, 25)
	structure_badge.z_index = 35
	structure_visual.add_child(structure_badge)
	
	structure_container.add_child(structure_visual)
	
	structure.sprite = structure_visual
	
	print("Created visual for ", structure.name, " at ", structure.grid_position)

func setup_interaction_system():
	interaction_tooltip = StructureInteractionTooltip.new()
	interaction_tooltip.z_index = 100
	add_child(interaction_tooltip)
	
	if interaction_tooltip.has_signal("interaction_requested"):
		interaction_tooltip.interaction_requested.connect(_on_structure_interaction_requested)
		print("MAIN: Interaction signal connected successfully")
	else:
		print("ERROR: interaction_requested signal not found on tooltip")
	
	print("Structure interaction system initialized")

func check_structure_interactions():
	if not player_movement:
		return
	
	var player_pos = player_movement.get_current_position()
	var interactable_structures = World.get_player_structure_interactions(player_pos)
	
	if interactable_structures.size() > 0:
		var structure = interactable_structures[0]
		if interaction_tooltip and (not interaction_tooltip.visible or interaction_tooltip.current_structure != structure):
			var player_world_pos = player.position
			interaction_tooltip.position_above_target(player_world_pos)
			interaction_tooltip.show_for_structure(structure)
	else:
		if interaction_tooltip and interaction_tooltip.visible:
			interaction_tooltip.hide_tooltip()

func _on_structure_interaction_requested(structure):
	print("MAIN: _on_structure_interaction_requested called!")
	
	if not structure:
		print("ERROR: Received null structure for interaction")
		return
	
	var structure_name = str(structure.name) if structure.name else "Unknown"
	var structure_type = str(structure.type)
	
	print("MAIN: Interacting with structure: ", structure_name, " (", structure_type, ")")
	print("MAIN: structure_interior_overlay exists: ", structure_interior_overlay != null)
	print("MAIN: structure_interior_overlay valid: ", is_instance_valid(structure_interior_overlay) if structure_interior_overlay else false)
	
	if interaction_tooltip and is_instance_valid(interaction_tooltip):
		interaction_tooltip.hide_tooltip()
	
	if structure_interior_overlay and is_instance_valid(structure_interior_overlay):
		structure_interior_overlay.show_for_structure(structure)
	else:
		print("WARNING: Structure interior overlay not available, using fallback")
		handle_structure_interaction_fallback(structure)

func handle_structure_interaction_fallback(structure):
	print("Using fallback interaction handler for ", structure.name)
	
	if structure.is_enterable:
		show_structure_entered_message(structure)
	else:
		show_structure_interaction_message(structure)

func show_structure_entered_message(structure):
	print("You have entered ", structure.name)
	print("Population: ", structure.population)
	print("Services: ", structure.services)
	print("Shops: ", structure.shops)

func show_structure_interaction_message(structure):
	print("You interact with ", structure.name)
	print("Description: ", structure.description)
	if structure.guards > 0:
		print("Guards: ", structure.guards)

func setup_parallax_background():
	parallax_bg = ParallaxBackground.new()
	add_child(parallax_bg)
	move_child(parallax_bg, 0)
	
	create_background_cloud_layer()
	create_midground_cloud_layer()
	create_foreground_cloud_layer()
	
	print("Parallax cloud system initialized with real cloud assets")

func create_background_cloud_layer():
	var cloud_layer = ParallaxLayer.new()
	cloud_layer.motion_scale = Vector2(0.1, 0.1)
	cloud_layer.motion_mirroring = Vector2(2048, 1536)
	
	for i in range(8):
		var cloud_sprite = create_cloud_sprite(randi_range(1, 10))
		cloud_sprite.position = Vector2(
			randf_range(-1024, 1024),
			randf_range(-768, 768)
		)
		cloud_sprite.scale = Vector2(0.8, 0.8)
		cloud_sprite.modulate = Color(0.9, 0.9, 1.0, 0.4)
		cloud_layer.add_child(cloud_sprite)
	
	parallax_bg.add_child(cloud_layer)

func create_midground_cloud_layer():
	var cloud_layer = ParallaxLayer.new()
	cloud_layer.motion_scale = Vector2(0.3, 0.3)
	cloud_layer.motion_mirroring = Vector2(1536, 1152)
	
	for i in range(6):
		var cloud_sprite = create_cloud_sprite(randi_range(1, 10))
		cloud_sprite.position = Vector2(
			randf_range(-768, 768),
			randf_range(-576, 576)
		)
		cloud_sprite.scale = Vector2(1.0, 1.0)
		cloud_sprite.modulate = Color(0.95, 0.95, 1.0, 0.6)
		cloud_layer.add_child(cloud_sprite)
	
	parallax_bg.add_child(cloud_layer)

func create_foreground_cloud_layer():
	var cloud_layer = ParallaxLayer.new()
	cloud_layer.motion_scale = Vector2(0.5, 0.5)
	cloud_layer.motion_mirroring = Vector2(1024, 768)
	
	for i in range(4):
		var cloud_sprite = create_cloud_sprite(randi_range(1, 10))
		cloud_sprite.position = Vector2(
			randf_range(-512, 512),
			randf_range(-384, 384)
		)
		cloud_sprite.scale = Vector2(1.2, 1.2)
		cloud_sprite.modulate = Color(1.0, 1.0, 1.0, 0.8)
		cloud_layer.add_child(cloud_sprite)
	
	parallax_bg.add_child(cloud_layer)

func create_cloud_sprite(cloud_number: int) -> Sprite2D:
	var sprite = Sprite2D.new()
	var cloud_path = "res://assets/clouds/cloud_" + str(cloud_number) + ".png"
	sprite.texture = load(cloud_path)
	sprite.z_index = -10
	return sprite

func setup_cloud_manager():
	CloudManager.set_camera_reference(camera)
	CloudManager.set_player_reference(player)
	
	CloudManager.clouds_visibility_changed.connect(_on_clouds_visibility_changed)
	
	print("Advanced cloud management system configured for main scene")

func setup_structure_interior_overlay():
	print("MAIN: Setting up structure interior overlay...")
	
	var canvas_layer = CanvasLayer.new()
	canvas_layer.name = "OverlayLayer"
	canvas_layer.layer = 100
	add_child(canvas_layer)
	
	structure_interior_overlay = StructureInteriorOverlay.new()
	
	if not structure_interior_overlay:
		print("ERROR: Failed to create StructureInteriorOverlay instance")
		return
		
	structure_interior_overlay.name = "StructureInteriorOverlay"
	
	print("MAIN: Adding overlay to canvas layer...")
	canvas_layer.add_child(structure_interior_overlay)
	
	if not structure_interior_overlay.is_inside_tree():
		print("ERROR: Failed to add overlay to scene tree")
		structure_interior_overlay = null
		return
	
	print("MAIN: Overlay added successfully, connecting signals...")
	if structure_interior_overlay.has_signal("exit_requested"):
		structure_interior_overlay.exit_requested.connect(_on_interior_overlay_exit)
		print("MAIN: Exit signal connected successfully")
	else:
		print("WARNING: exit_requested signal not found on overlay")
	
	print("MAIN: Structure interior overlay system initialized successfully")
	print("MAIN: Overlay position: ", structure_interior_overlay.position, " size: ", structure_interior_overlay.size)

func _on_interior_overlay_exit():
	print("Player exited structure interior")


func _on_clouds_visibility_changed(visible_count: int):
	if visible_count > 15:
		pass

func update_ship_wind_effects(is_moving: bool):
	if player_ship:
		var velocity = Vector2.ZERO
		if is_moving and player_movement:
			var current_pos = player_movement.get_current_position()
			var target_pos = player_movement.get_target_position()
			var movement_vector = target_pos - current_pos
			velocity = Vector2(movement_vector.x, movement_vector.y) * 50.0
		
		player_ship.update_wind_effects(velocity, is_moving)

func track_movement_distance():
	if not Global.player or not Global.player.stats:
		return
	
	if last_player_position == Vector2.ZERO:
		last_player_position = player.position
		return
	
	var current_position = player.position
	var distance_this_frame = last_player_position.distance_to(current_position)
	
	if distance_this_frame > 0.1:
		total_distance_traveled += distance_this_frame
		
		if total_distance_traveled >= ENERGY_COST_DISTANCE:
			var energy_to_deduct = int(total_distance_traveled / ENERGY_COST_DISTANCE)
			total_distance_traveled = fmod(total_distance_traveled, ENERGY_COST_DISTANCE)
			
			handle_movement_costs(energy_to_deduct)
	
	last_player_position = current_position

func handle_movement_costs(energy_cost: int = 1):
	if not Global.player or not Global.player.stats:
		return
	
	var player_stats = Global.player.stats
	
	for i in range(energy_cost):
		var was_exhausted = player_stats.is_exhausted()
		
		print("Distance-based energy depletion - Total distance: ", total_distance_traveled + ENERGY_COST_DISTANCE)
		print("Before depletion - Energy: ", player_stats.energy, " Health: ", player_stats.health)
		
		player_stats.deplete_energy_or_health(1, 1)
		
		print("After depletion - Energy: ", player_stats.energy, " Health: ", player_stats.health)
		
		if was_exhausted:
			print("No energy! Health depleted: ", player_stats.health, "/", player_stats.max_health)
			if player_stats.health <= 0:
				handle_player_death()
		else:
			print("Energy depleted: ", player_stats.energy, "/", player_stats.max_energy)

func handle_player_death():
	print("Player has died from exhaustion!")
	Global.player.stats.health = 10
	print("Emergency health restore activated!")

func update_parallax_effects():
	if parallax_bg:
		parallax_bg.scroll_offset = camera.position

func open_settings_dialogue():
	SettingsManager.open_settings_with_callback(self, _on_settings_closed)

func _on_settings_closed():
	print("Settings menu closed in game")

func fire_player_spear():
	if not spear_pool:
		print("SpearPool not available!")
		return
	
	var player_world_pos = player.position
	var target = find_nearest_enemy_target(player_world_pos)
	
	if target:
		# Fire at the nearest enemy
		var direction_to_target = (target.position - player_world_pos).normalized()
		var spawn_offset = 50.0
		var spear_spawn_pos = player_world_pos + direction_to_target * spawn_offset
		
		var success = spear_pool.launch_spear(
			spear_spawn_pos,
			target.position,
			400.0,
			2,
			player
		)
		
		if success:
			print("Player fired spear at ", target.name if target.has_method("get_name") else "enemy")
		else:
			print("No spears available in pool!")
	else:
		# No target found - fire in direction of mouse cursor
		var mouse_world_pos = get_global_mouse_position()
		var direction_to_mouse = (mouse_world_pos - player_world_pos).normalized()
		var spawn_offset = 50.0
		var spear_spawn_pos = player_world_pos + direction_to_mouse * spawn_offset
		
		# Calculate target position at maximum range (400 pixels from spawn)
		var max_range = 400.0
		var target_pos = spear_spawn_pos + direction_to_mouse * max_range
		
		var success = spear_pool.launch_spear(
			spear_spawn_pos,
			target_pos,
			400.0,
			2,
			player
		)
		
		if success:
			print("Player fired spear toward mouse direction")
		else:
			print("No spears available in pool!")

func fire_player_spear_at_position(target_pos: Vector2) -> bool:
	"""Fire a spear at a specific position - called by ammo UI"""
	if not spear_pool:
		print("SpearPool not available!")
		return false
	
	var player_world_pos = player.position
	var direction_to_target = (target_pos - player_world_pos).normalized()
	var spawn_offset = 50.0
	var spear_spawn_pos = player_world_pos + direction_to_target * spawn_offset
	
	# Calculate actual target position (limit to max range)
	var max_range = 400.0
	var distance_to_target = player_world_pos.distance_to(target_pos)
	var actual_target_pos = target_pos
	
	if distance_to_target > max_range:
		actual_target_pos = player_world_pos + direction_to_target * max_range
	
	var success = spear_pool.launch_spear(
		spear_spawn_pos,
		actual_target_pos,
		400.0,
		2,
		player
	)
	
	if success:
		print("Player fired spear via ammo UI")
	else:
		print("No spears available in pool!")
	
	return success

func find_nearest_enemy_target(from_pos: Vector2) -> Node2D:
	var nearest_target: Node2D = null
	var nearest_distance: float = INF
	var max_range: float = 300.0
	
	# Only consider active NPCs (chunk-based activation) + always-active dragons
	if chunk_manager:
		var active_npcs = chunk_manager.active_npcs
		for npc in active_npcs:
			if npc and is_instance_valid(npc) and npc.is_active and npc.visible:
				var distance = from_pos.distance_to(npc.position)
				if distance <= max_range and distance < nearest_distance:
					nearest_target = npc
					nearest_distance = distance
		
		# Also check all dragons since they're always active
		var dragons = World.get_dragons()
		for dragon in dragons:
			if dragon and is_instance_valid(dragon) and dragon.is_active and dragon.visible:
				var distance = from_pos.distance_to(dragon.position)
				if distance <= max_range and distance < nearest_distance:
					nearest_target = dragon
					nearest_distance = distance
	else:
		# Fallback to all NPCs if chunk manager isn't available
		var npcs = World.get_npcs()
		for npc in npcs:
			if npc and is_instance_valid(npc):
				var distance = from_pos.distance_to(npc.position)
				if distance <= max_range and distance < nearest_distance:
					nearest_target = npc
					nearest_distance = distance
		
		var dragons = World.get_dragons()
		for dragon in dragons:
			if dragon and is_instance_valid(dragon):
				var distance = from_pos.distance_to(dragon.position)
				if distance <= max_range and distance < nearest_distance:
					nearest_target = dragon
					nearest_distance = distance
	
	return nearest_target

func show_aim_cursor():
	if not aim_cursor or not aim_line:
		return
	
	var player_world_pos = player.position
	var target = find_nearest_enemy_target(player_world_pos)
	
	if target:
		aim_cursor.visible = true
		aim_cursor.position = Vector2.ZERO
		
		aim_line.clear_points()
		aim_line.add_point(player_world_pos)
		aim_line.add_point(target.position)
		aim_line.default_color = Color(1.0, 0.3, 0.3, 0.7)
		
		var target_indicator = aim_cursor.get_node_or_null("TargetCircle")
		if target_indicator:
			target_indicator.position = target.position
			target_indicator.queue_redraw()
	else:
		# No enemies - aim toward mouse cursor
		aim_cursor.visible = true
		aim_cursor.position = Vector2.ZERO
		
		var mouse_world_pos = get_global_mouse_position()
		var direction_to_mouse = (mouse_world_pos - player_world_pos).normalized()
		var aim_distance = 200.0  # Length of aim line
		var aim_end_pos = player_world_pos + direction_to_mouse * aim_distance
		
		aim_line.clear_points()
		aim_line.add_point(player_world_pos)
		aim_line.add_point(aim_end_pos)
		aim_line.default_color = Color(0.8, 0.8, 0.2, 0.7)  # Yellow color for manual aim
		
		# Show target circle at mouse position (clamped to reasonable distance)
		var target_indicator = aim_cursor.get_node_or_null("TargetCircle")
		if target_indicator:
			var mouse_distance = player_world_pos.distance_to(mouse_world_pos)
			var clamped_mouse_pos = mouse_world_pos
			if mouse_distance > 400.0:  # Clamp to max spear range
				clamped_mouse_pos = player_world_pos + direction_to_mouse * 400.0
			target_indicator.position = clamped_mouse_pos
			target_indicator.queue_redraw()

func hide_aim_cursor():
	if aim_cursor:
		aim_cursor.visible = false

func setup_settings_button():
	var ui_layer = CanvasLayer.new()
	ui_layer.name = "SettingsUI"
	ui_layer.layer = 100
	add_child(ui_layer)
	
	settings_button = Button.new()
	settings_button.text = "⚙ Settings"
	settings_button.custom_minimum_size = Vector2(120, 40)
	
	settings_button.mouse_filter = Control.MOUSE_FILTER_STOP
	
	settings_button.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	settings_button.position = Vector2(-140, 20)
	
	var button_style = StyleBoxFlat.new()
	button_style.bg_color = Color(0.2, 0.2, 0.2, 0.9)
	button_style.border_color = Color(0.8, 0.6, 0.3, 1.0)
	button_style.border_width_left = 2
	button_style.border_width_right = 2
	button_style.border_width_top = 2
	button_style.border_width_bottom = 2
	button_style.corner_radius_top_left = 5
	button_style.corner_radius_top_right = 5
	button_style.corner_radius_bottom_left = 5
	button_style.corner_radius_bottom_right = 5
	
	var button_theme = Theme.new()
	button_theme.set_stylebox("normal", "Button", button_style)
	button_theme.set_stylebox("hover", "Button", button_style)
	button_theme.set_stylebox("pressed", "Button", button_style)
	button_theme.set_color("font_color", "Button", Color.WHITE)
	button_theme.set_font_size("font_size", "Button", 14)
	
	settings_button.theme = button_theme
	
	settings_button.pressed.connect(_on_settings_button_pressed)
	
	ui_layer.add_child(settings_button)
	
	print("Settings button created in top-right corner")

func setup_airship_ammo_ui():
	"""Initialize the airship ammo UI for spear firing"""
	var ammo_ui_scene = preload("res://scenes/entities/airship/airship_ammo.tscn")
	airship_ammo_ui = ammo_ui_scene.instantiate()
	
	# Create a dedicated UI layer for the ammo UI
	var ammo_ui_layer = CanvasLayer.new()
	ammo_ui_layer.name = "AmmoUI"
	ammo_ui_layer.layer = 50  # Below settings (100) but above game elements
	add_child(ammo_ui_layer)
	ammo_ui_layer.add_child(airship_ammo_ui)
	
	# Set references so the ammo UI can interact with the game
	airship_ammo_ui.set_references(player, self)
	
	# Connect signals
	airship_ammo_ui.spear_fired.connect(_on_ammo_ui_spear_fired)
	airship_ammo_ui.auto_fire_toggled.connect(_on_ammo_ui_auto_fire_toggled)
	
	print("Airship ammo UI initialized")

func _on_ammo_ui_spear_fired(target_position: Vector2):
	"""Called when the ammo UI fires a spear"""
	print("Spear fired via ammo UI at position: ", target_position)

func _on_ammo_ui_auto_fire_toggled(enabled: bool):
	"""Called when auto-fire mode is toggled"""
	print("Auto-fire mode ", "enabled" if enabled else "disabled")

func _on_settings_button_pressed():
	open_settings_dialogue()

func setup_battle_system():
	# Load and instantiate the battle scene
	var battle_scene_resource = load("res://scenes/battle/battle.tscn")
	battle_scene = battle_scene_resource.instantiate()
	battle_scene.visible = false
	
	# Add to a canvas layer above the game
	var battle_layer = CanvasLayer.new()
	battle_layer.name = "BattleLayer"
	battle_layer.layer = 200  # Above everything else
	add_child(battle_layer)
	battle_layer.add_child(battle_scene)
	
	# Connect battle signals
	if battle_scene.has_signal("battle_ended"):
		battle_scene.battle_ended.connect(_on_battle_ended)
	
	# For web performance, we'll use frame-based checking instead of timer
	# This is handled in _process() with accumulator pattern
	
	print("Battle system initialized with web-optimized proximity checking")

func _check_npc_proximity_for_battle():
	# Don't check if battle is already active or in cooldown
	if battle_scene and battle_scene.visible:
		return
	
	# Check cooldown
	var current_time = Time.get_ticks_msec() / 1000.0
	if current_time - last_battle_time < battle_cooldown:
		return
	
	# Get player position
	if not player_movement:
		return
	
	var player_pos = player_movement.get_current_position()
	
	# Web optimization: Early exit if no active NPCs
	if not chunk_manager or not chunk_manager.active_npcs or chunk_manager.active_npcs.is_empty():
		return
	
	# Check only active NPCs for proximity (much faster for web)
	var nearby_npc = null
	
	for npc in chunk_manager.active_npcs:
		# Skip invalid NPCs quickly
		if not npc or not is_instance_valid(npc) or not npc.is_active or not npc.visible:
			continue
		
		# Manhattan distance is faster than Euclidean
		var distance = abs(player_pos.x - npc.grid_position.x) + abs(player_pos.y - npc.grid_position.y)
		if distance <= 2:  # Within 1-2 tiles
			nearby_npc = npc
			break  # Stop checking once we find one
	
	# Start battle if NPC is nearby
	if nearby_npc:
		start_battle_with_npc(nearby_npc)

func start_battle_with_npc(npc: Node2D):
	if not battle_scene:
		print("Battle scene not initialized!")
		return
	
	print("Starting battle with NPC at position: ", npc.grid_position)
	
	# Prepare battle data
	var player_data = {
		"health": Global.player.stats.health if Global.player and Global.player.stats else 100,
		"max_health": Global.player.stats.max_health if Global.player and Global.player.stats else 100,
		"energy": Global.player.stats.energy if Global.player and Global.player.stats else 100,
		"max_energy": Global.player.stats.max_energy if Global.player and Global.player.stats else 100,
		"mana": Global.player.stats.mana if Global.player and Global.player.stats else 50,
		"max_mana": Global.player.stats.max_mana if Global.player and Global.player.stats else 50
	}
	
	var enemy_data = {
		"health": npc.current_health if npc.has("current_health") else 80,
		"max_health": npc.max_health if npc.has("max_health") else 80,
		"energy": 60,
		"max_energy": 60,
		"name": npc.name if npc.has("name") else "Enemy Ship"
	}
	
	# Hide game world elements during battle
	if map_container:
		map_container.visible = false
	if npc_container:
		npc_container.visible = false
	if structure_container:
		structure_container.visible = false
	if parallax_bg:
		parallax_bg.visible = false
	
	# Start the battle
	battle_scene.start_battle(player_data, enemy_data)
	
	# Store the NPC reference for post-battle handling
	battle_scene.set_meta("battle_npc", npc)
	
	# Update last battle time
	last_battle_time = Time.get_ticks_msec() / 1000.0

func _on_battle_ended(won: bool):
	print("Battle ended! Player won: ", won)
	
	# Show game world elements again
	if map_container:
		map_container.visible = true
	if npc_container:
		npc_container.visible = true
	if structure_container:
		structure_container.visible = true
	if parallax_bg:
		parallax_bg.visible = true
	
	# Handle battle result
	if won:
		# Remove the defeated NPC
		var defeated_npc = battle_scene.get_meta("battle_npc", null)
		if defeated_npc and is_instance_valid(defeated_npc):
			print("Removing defeated NPC")
			if chunk_manager:
				chunk_manager.unregister_npc(defeated_npc)
			defeated_npc.queue_free()
		
		# Update player stats if needed
		if Global.player and Global.player.stats:
			# You could add experience, loot, etc. here
			print("Victory! Player gains experience")
	else:
		# Player lost - handle defeat
		if Global.player and Global.player.stats:
			# Reset player health or respawn
			Global.player.stats.health = max(10, Global.player.stats.health)
			print("Defeat... Player respawns with minimal health")

func _force_battle_with_nearest_npc():
	"""Debug function to force a battle with the nearest NPC"""
	if not player_movement:
		return
	
	var player_pos = player_movement.get_current_position()
	var nearest_npc = null
	var min_distance = INF
	
	# Check all NPCs (not just active ones for debugging)
	var all_npcs = World.get_npcs()
	for npc in all_npcs:
		if npc and is_instance_valid(npc):
			var distance = abs(player_pos.x - npc.grid_position.x) + abs(player_pos.y - npc.grid_position.y)
			if distance < min_distance:
				min_distance = distance
				nearest_npc = npc
	
	if nearest_npc:
		print("DEBUG: Forcing battle with NPC at distance ", min_distance)
		start_battle_with_npc(nearest_npc)
	else:
		print("DEBUG: No NPCs found for battle")

func _unhandled_input(event):
	pass
