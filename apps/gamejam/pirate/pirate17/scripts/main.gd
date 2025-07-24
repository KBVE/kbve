extends Node2D

const Movement = preload("res://scripts/world/movement.gd")
const BorderSlicer = preload("res://scripts/ui/border_slicer.gd")

@onready var camera = $Camera2D
@onready var map_container = $MapContainer
@onready var player = $Player
@onready var player_ship = $Player/PlayerShip
@onready var path_line = $PathVisualizer/PathLine
@onready var path_visualizer = $PathVisualizer
@onready var target_highlight = $PathVisualizer/TargetHighlight
@onready var player_info_ui: PlayerInfoUI = $UI/PlayerInfo

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
var total_distance_traveled: float = 0.0  # Track actual distance traveled
var last_player_position: Vector2 = Vector2.ZERO  # Track previous position
const ENERGY_COST_DISTANCE: float = 128.0  # 1 energy per 128 pixels (4 tiles worth)
var structure_interior_overlay: StructureInteriorOverlay
var settings_button: Button
var ocean_tiles: Array[AnimatedSprite2D] = []
var spear_pool: SpearPool
var aim_cursor: Node2D
var aim_line: Line2D

func _ready():
	# Add this scene to the main_scene group for easy finding
	add_to_group("main_scene")
	
	# Force reload border assets with updated transparency
	BorderSlicer.is_loaded = false  # Force reload
	BorderSlicer.load_and_slice_borders()
	
	generate_map_display()
	
	# Initialize world structures after map generation
	World.initialize_world()
	
	# Render structures on the map
	render_structures()
	
	setup_player_movement()
	setup_npc_container()
	setup_spear_pool()
	setup_aim_cursor()
	spawn_npcs()
	# PlayerInfo scene handles its own initialization and connections
	connect_movement_signals()
	connect_ship_signals()
	setup_target_highlight()
	setup_interaction_system()
	setup_parallax_background()
	setup_cloud_manager()
	setup_structure_interior_overlay()
	setup_settings_button()

func setup_target_highlight():
	# Set the border texture for target highlighting - use a nice decorative border
	var border_texture = BorderSlicer.get_border_texture_by_position(2, 0)  # Third border, more decorative
	if border_texture:
		target_highlight.texture = border_texture
		target_highlight.modulate = Color(0.8, 1.0, 1.0, 0.9)  # Slight cyan tint with transparency
		print("Target highlight border texture set")
	else:
		print("Failed to load border texture")

func setup_player_movement():
	# Get saved player position or default
	var start_position = Vector2i(50, 50)
	if Player:
		start_position = Player.current_position
	
	player_movement = Movement.MoveComponent.new(player, start_position)
	camera.position = player.position
	
	print("Player movement initialized at position: ", start_position)

func generate_map_display():
	var map_size = World.get_map_size()
	print("Generating map display with size: ", map_size, " (", map_size.x * TILE_SIZE, "x", map_size.y * TILE_SIZE, " pixels)")
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			var tile_color = World.get_tile_at(x, y)
			create_tile_sprite(x, y, tile_color)

func create_tile_sprite(x: int, y: int, color_hex: String):
	var tile_position = Vector2(x * TILE_SIZE, y * TILE_SIZE)
	
	# Debug: Print ocean color comparison
	var ocean_color = Map.tile_colors["ocean"]
	if x < 5 and y < 5:
		print("Tile at ", x, ",", y, " has color: '", color_hex, "' vs ocean: '", ocean_color, "' match: ", color_hex == ocean_color)
	
	# Check if this is an ocean tile - use Map.tile_colors for accuracy
	if color_hex == ocean_color:
		var ocean_tile = create_animated_ocean_tile()
		ocean_tile.position = tile_position
		map_container.add_child(ocean_tile)
		tile_sprites[Vector2i(x, y)] = ocean_tile
		print("✓ Created animated OCEAN tile at ", x, ",", y)
		return
	
	# Regular colored tile for non-ocean tiles
	var tile = ColorRect.new()
	tile.size = Vector2(TILE_SIZE, TILE_SIZE)
	tile.position = tile_position
	tile.color = Color(color_hex)
	
	map_container.add_child(tile)
	tile_sprites[Vector2i(x, y)] = tile
	
	# Debug: Highlight if this is creating a blue ColorRect that might be ocean
	if color_hex == "#1E3A8A":
		print("⚠ Created blue ColorRect at ", x, ",", y, " - this should have been ocean!")

func create_animated_ocean_tile() -> AnimatedSprite2D:
	var ocean_sprite = AnimatedSprite2D.new()
	
	# Load the water spritesheet
	var spritesheet = load("res://assets/ocean/water_spritesheet_16x16_5frames.png")
	
	# Create SpriteFrames for the animated sprite
	var sprite_frames = SpriteFrames.new()
	sprite_frames.add_animation("wave")
	
	# Since it's 16x16 with 5 frames, each frame is 16x16 pixels
	# The spritesheet is likely 80x16 (5 frames horizontally)
	var frame_width = 16
	var frame_height = 16
	
	# Create individual frames from the spritesheet
	for i in range(5):
		var atlas_texture = AtlasTexture.new()
		atlas_texture.atlas = spritesheet
		atlas_texture.region = Rect2(i * frame_width, 0, frame_width, frame_height)
		sprite_frames.add_frame("wave", atlas_texture)
	
	# Set animation properties
	sprite_frames.set_animation_speed("wave", 8.0)  # 8 FPS for smooth water
	sprite_frames.set_animation_loop("wave", true)
	
	ocean_sprite.sprite_frames = sprite_frames
	ocean_sprite.animation = "wave"
	ocean_sprite.play()
	
	# Scale up from 16x16 to 32x32 tile size
	ocean_sprite.scale = Vector2(2.0, 2.0)
	
	# Add slight randomization to animation timing for variety
	ocean_sprite.speed_scale = randf_range(0.8, 1.2)
	
	# Add to ocean tiles array for potential management
	ocean_tiles.append(ocean_sprite)
	
	return ocean_sprite

func _input(event):
	# Handle spacebar press/release for aim cursor
	if event is InputEventKey and event.keycode == KEY_SPACE:
		if event.pressed and not event.echo:
			show_aim_cursor()
		elif not event.pressed:
			hide_aim_cursor()
			fire_player_spear()
		return
	
	if event is InputEventKey and event.pressed:
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
				# Handle structure interaction
				if interaction_tooltip and interaction_tooltip.visible:
					interaction_tooltip.handle_interaction_key()
				return  # Don't process as movement
			KEY_ESCAPE:
				# Open settings dialogue
				open_settings_dialogue()
				return
		
		if new_pos != current_pos:
			initiate_movement_with_rotation(current_pos, new_pos, true)  # WASD movement
	
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# Simple check: is the mouse over any UI control that should block input?
		if is_mouse_over_blocking_ui():
			return
			
		var mouse_world_pos = get_global_mouse_position()
		var grid_pos = Movement.get_grid_position(mouse_world_pos)
		var current_pos = player_movement.get_current_position()
		
		initiate_movement_with_rotation(current_pos, grid_pos, false)  # Click movement

func is_mouse_over_blocking_ui() -> bool:
	"""Simple check if mouse is over any UI element that should block game input"""
	var viewport = get_viewport()
	if not viewport:
		return false
		
	# Use Godot's built-in GUI input check - this is the most reliable method
	# It checks if any Control node would receive the mouse event
	var mouse_pos = viewport.get_mouse_position()
	
	# First, use viewport's method to check if GUI will handle the input
	if viewport.gui_is_dragging():
		return true
	
	# Check specific UI elements we know about
	# Check settings button with proper rect calculation
	if settings_button and settings_button.visible:
		# Get the actual screen rect of the button
		var button_rect = settings_button.get_global_rect()
		# Add some padding to make it easier to click
		button_rect = button_rect.grow(5)
		if button_rect.has_point(mouse_pos):
			print("Mouse over settings button - blocking movement")
			return true
	
	# Check if settings menu/dialogue is open
	var settings_layer = get_node_or_null("SettingsLayer")
	if settings_layer and settings_layer.visible and settings_layer.get_child_count() > 0:
		print("Settings menu open - blocking all input")
		return true
	
	# Check if structure interior overlay is visible (it covers the whole screen)
	if structure_interior_overlay and structure_interior_overlay.visible:
		print("Structure interior overlay visible - blocking all input")
		return true
	
	# Check if interaction tooltip is visible and mouse is over it
	if interaction_tooltip and interaction_tooltip.visible:
		var tooltip_rect = Rect2(interaction_tooltip.global_position, interaction_tooltip.size)
		if tooltip_rect.has_point(mouse_pos):
			print("Mouse over interaction tooltip - blocking movement")
			return true
	
	return false

func initiate_movement_with_rotation(from: Vector2i, to: Vector2i, immediate: bool):
	"""Start movement with smooth rotation animation first"""
	# If already waiting for rotation, cancel previous and start new movement
	if is_waiting_for_rotation:
		is_waiting_for_rotation = false
		pending_movement = Vector2i.ZERO
		# Stop any ongoing rotation
		if player_ship and player_ship.rotation_tween:
			player_ship.rotation_tween.kill()
			player_ship.is_rotating = false
	
	# Check if movement is valid
	if not Movement.is_valid_move(from, to):
		return
	
	# If ship needs to rotate and this isn't immediate movement, do rotation first
	if player_ship and not immediate:
		# Calculate if we need significant rotation
		var movement_vector = to - from
		if movement_vector != Vector2i.ZERO:
			var target_angle = atan2(movement_vector.y, movement_vector.x) + PI / 2
			var current_angle = player_ship.sprite.rotation if player_ship.sprite else 0.0
			
			# Normalize angles for comparison
			var angle_diff = abs(target_angle - current_angle)
			while angle_diff > PI:
				angle_diff = abs(angle_diff - 2 * PI)
			
			# If any rotation needed (more than 5 degrees), rotate first
			if angle_diff > PI / 36:  # 5 degrees threshold (much more sensitive)
				is_waiting_for_rotation = true
				pending_movement = to
				player_ship.update_direction_from_movement(from, to)
				return
	
	# No significant rotation needed or immediate movement - move directly
	player_movement.move_to(to, immediate)
	# Update ship direction for immediate movements
	if player_ship and immediate:
		player_ship.update_direction_from_movement(from, to)

func _process(delta):
	player_movement.process_movement(delta)
	camera.position = player.position
	update_movement_path()
	check_structure_interactions()
	update_parallax_effects()
	track_movement_distance()
	# Update play time
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
		# Update wind effects for movement
		update_ship_wind_effects(true)

func _on_ship_rotation_completed():
	"""Called when ship finishes rotating - now start the actual movement"""
	if is_waiting_for_rotation and pending_movement != Vector2i.ZERO:
		is_waiting_for_rotation = false
		# Start the actual movement
		player_movement.move_to(pending_movement, false)
		pending_movement = Vector2i.ZERO

func _on_movement_finished(entity: Node2D, at: Vector2i):
	if entity == player:
		hide_movement_path()
		# Stop wind effects when movement ends
		update_ship_wind_effects(false)
		# Update player position in save data
		if Player:
			Player.update_position(at)

func show_movement_path(from: Vector2i, to: Vector2i):
	var start_pos = Movement.get_world_position(from)
	var end_pos = Movement.get_world_position(to)
	
	# Create dotted line path with custom points
	path_line.clear_points()
	create_dotted_line(start_pos, end_pos)
	
	# Show target highlight with border
	show_target_border(to)

func show_target_border(grid_pos: Vector2i):
	var world_pos = Movement.get_world_position(grid_pos)
	# Center the border on the tile by offsetting by half the border size
	target_highlight.position = world_pos - Vector2(24, 24)  # Half of 48x48 size
	target_highlight.visible = true
	
	# Stop any existing animation before starting new one
	stop_border_animation()
	# Start pulsing animation
	start_border_animation()

func start_border_animation():
	# Create a more pronounced pulsing animation
	var tween = create_tween()
	tween.set_loops()  # Loop indefinitely
	tween.set_ease(Tween.EASE_IN_OUT)
	tween.set_trans(Tween.TRANS_BACK)  # More dramatic easing
	
	# Start from normal scale
	target_highlight.scale = Vector2.ONE
	
	# More pronounced animation - scales between 0.7 and 1.3
	tween.tween_property(target_highlight, "scale", Vector2(1.3, 1.3), 0.5)
	tween.tween_property(target_highlight, "scale", Vector2(0.7, 0.7), 0.5)

func stop_border_animation():
	# Stop any running tweens and reset scale
	var tweens = get_tree().get_processed_tweens()
	for tween in tweens:
		if tween.is_valid():
			tween.kill()
	target_highlight.scale = Vector2.ONE

func create_dotted_line(start: Vector2, end: Vector2):
	# Clear existing dash lines
	clear_dash_lines()
	
	var direction = (end - start).normalized()
	var distance = start.distance_to(end)
	var dash_length = 10.0  # Length of each dash
	var gap_length = 12.0   # Gap between dashes
	var current_distance = 0.0
	
	# Create separate Line2D nodes for each dash
	while current_distance < distance:
		var dash_start = start + direction * current_distance
		var dash_end_distance = min(current_distance + dash_length, distance)
		var dash_end = start + direction * dash_end_distance
		
		# Create a new Line2D for this dash
		var dash_line = Line2D.new()
		dash_line.width = 3.0
		dash_line.default_color = Color(0.8, 0.2, 0.2, 0.8)
		dash_line.add_point(dash_start)
		dash_line.add_point(dash_end)
		
		path_visualizer.add_child(dash_line)
		dash_lines.append(dash_line)
		
		# Move to start of next dash
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
	if player_movement.is_currently_moving():
		var current_pos = player.position
		var target_pos = Movement.get_world_position(player_movement.get_target_position())
		
		# Update path line to show current position to target
		path_line.clear_points()
		create_dotted_line(current_pos, target_pos)


func setup_npc_container():
	npc_container = Node2D.new()
	npc_container.name = "NPCs"
	add_child(npc_container)

func setup_spear_pool():
	# Create the spear pool for projectiles
	spear_pool = preload("res://scripts/entities/spear_pool.gd").new()
	add_child(spear_pool)
	print("SpearPool initialized")
	
	# Create the fireball pool for dragon projectiles
	var fireball_pool = preload("res://scripts/entities/fireball_pool.gd").new()
	fireball_pool.name = "FireballPool"
	add_child(fireball_pool)
	print("FireballPool initialized")
	
	# Create the regeneration manager for HP/MP recovery
	var regen_manager = preload("res://scripts/entities/regeneration_manager.gd").new()
	regen_manager.name = "RegenerationManager"
	add_child(regen_manager)
	print("RegenerationManager initialized")

func setup_aim_cursor():
	# Create aim cursor container
	aim_cursor = Node2D.new()
	aim_cursor.name = "AimCursor"
	aim_cursor.z_index = 20
	aim_cursor.visible = false
	
	# Create aim line
	aim_line = Line2D.new()
	aim_line.width = 2.0
	aim_line.default_color = Color(1.0, 0.3, 0.3, 0.7)  # Red with transparency
	aim_line.add_point(Vector2.ZERO)
	aim_line.add_point(Vector2.ZERO)
	aim_cursor.add_child(aim_line)
	
	# Create target circle with custom draw
	var target_circle = Node2D.new()
	target_circle.name = "TargetCircle"
	target_circle.z_index = 1
	# Add a simple draw script inline
	target_circle.set_script(GDScript.new())
	target_circle.get_script().source_code = """
extends Node2D

func _draw():
	# Draw targeting reticle
	var radius = 20.0
	var color = Color(1.0, 0.3, 0.3, 0.8)
	var width = 2.0
	
	# Draw circle
	draw_arc(Vector2.ZERO, radius, 0, TAU, 32, color, width)
	
	# Draw crosshair lines
	draw_line(Vector2(-radius - 5, 0), Vector2(-radius + 10, 0), color, width)
	draw_line(Vector2(radius - 10, 0), Vector2(radius + 5, 0), color, width)
	draw_line(Vector2(0, -radius - 5), Vector2(0, -radius + 10), color, width)
	draw_line(Vector2(0, radius - 10), Vector2(0, radius + 5), color, width)
"""
	aim_cursor.add_child(target_circle)
	
	add_child(aim_cursor)

func spawn_npcs():
	print("Starting NPC spawn process...")
	# Spawn NPCs through World system
	World.spawn_npcs(25)
	
	# Add spawned NPCs to the scene
	var npc_list = World.get_npcs()
	print("Retrieved ", npc_list.size(), " NPCs from World")
	
	for npc in npc_list:
		# Add to scene first, then ensure position is set correctly
		npc_container.add_child(npc)
		# Force update position after being added to scene tree
		npc.update_position_after_scene_ready()
		print("Added NPC to scene at world position: ", npc.position)
	
	# Add dragons to the scene
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
	return Vector2i(50, 50)  # Default fallback position

func render_structures():
	# Create structure container
	structure_container = Node2D.new()
	structure_container.name = "Structures"
	structure_container.z_index = 5  # Above map tiles but below NPCs
	add_child(structure_container)
	
	# Get all structures from the world
	var structures = World.get_all_structures()
	print("Rendering ", structures.size(), " structures on map")
	
	for structure in structures:
		create_structure_visual(structure)

func create_structure_visual(structure):
	# Create a visual container for the structure
	var structure_visual = Node2D.new()
	structure_visual.name = structure.name
	structure_visual.z_index = structure.visual_data.get("render_priority", 5)
	
	# Position the structure visual at the center of its occupied area
	var center_x = structure.grid_position.x + (structure.size.x / 2.0) - 0.5
	var center_y = structure.grid_position.y + (structure.size.y / 2.0) - 0.5
	structure_visual.position = Vector2(center_x * TILE_SIZE, center_y * TILE_SIZE)
	
	# Create background tiles for the structure footprint
	for x in range(structure.size.x):
		for y in range(structure.size.y):
			var tile_bg = ColorRect.new()
			tile_bg.size = Vector2(TILE_SIZE, TILE_SIZE)
			tile_bg.position = Vector2(
				(structure.grid_position.x + x - center_x) * TILE_SIZE,
				(structure.grid_position.y + y - center_y) * TILE_SIZE
			)
			tile_bg.color = structure.visual_data.get("color", Color.GRAY)
			tile_bg.color.a = 0.8  # Slightly transparent
			structure_visual.add_child(tile_bg)
	
	# Create structure icon/symbol in the center
	var icon_label = Label.new()
	icon_label.text = structure.visual_data.get("symbol", "🏗")
	icon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	icon_label.add_theme_font_size_override("font_size", 20)
	icon_label.position = Vector2(-16, -16)  # Center the 32x32 icon
	icon_label.size = Vector2(32, 32)
	structure_visual.add_child(icon_label)
	
	# Create fantasy structure badge
	var structure_badge = FantasyStructureBadge.new()
	structure_badge.structure_name = structure.name
	structure_badge.structure_type = StructurePool.StructureType.keys()[structure.type]
	structure_badge.set_badge_texture_by_type(structure.type)
	structure_badge.position = Vector2(-40, 25)  # Below the icon
	structure_badge.z_index = 35  # Above everything
	structure_visual.add_child(structure_badge)
	
	structure_container.add_child(structure_visual)
	
	# Store reference in the structure for future use
	structure.sprite = structure_visual
	
	print("Created visual for ", structure.name, " at ", structure.grid_position)

func setup_interaction_system():
	# Create interaction tooltip
	interaction_tooltip = StructureInteractionTooltip.new()
	interaction_tooltip.z_index = 100  # Above everything else
	add_child(interaction_tooltip)
	
	# Connect interaction signal
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
		# Show tooltip for the first interactable structure
		var structure = interactable_structures[0]
		if not interaction_tooltip.visible or interaction_tooltip.current_structure != structure:
			var player_world_pos = player.position
			interaction_tooltip.position_above_target(player_world_pos)
			interaction_tooltip.show_for_structure(structure)
	else:
		# Hide tooltip if no structures nearby
		if interaction_tooltip.visible:
			interaction_tooltip.hide_tooltip()

func _on_structure_interaction_requested(structure):
	print("MAIN: _on_structure_interaction_requested called!")
	
	# Comprehensive error handling for structure interaction
	if not structure:
		print("ERROR: Received null structure for interaction")
		return
	
	# Safe property access for logging - Structure class always has these properties
	var structure_name = str(structure.name) if structure.name else "Unknown"
	var structure_type = str(structure.type)
	
	print("MAIN: Interacting with structure: ", structure_name, " (", structure_type, ")")
	print("MAIN: structure_interior_overlay exists: ", structure_interior_overlay != null)
	print("MAIN: structure_interior_overlay valid: ", is_instance_valid(structure_interior_overlay) if structure_interior_overlay else false)
	
	# Hide the tooltip safely
	if interaction_tooltip and is_instance_valid(interaction_tooltip):
		interaction_tooltip.hide_tooltip()
	
	# Show the simple interior overlay with error handling
	if structure_interior_overlay and is_instance_valid(structure_interior_overlay):
		structure_interior_overlay.show_for_structure(structure)
	else:
		print("WARNING: Structure interior overlay not available, using fallback")
		# Fallback to old system
		handle_structure_interaction_fallback(structure)

func handle_structure_interaction_fallback(structure):
	"""Fallback handler for structure interactions when overlay system is not available"""
	print("Using fallback interaction handler for ", structure.name)
	
	if structure.is_enterable:
		show_structure_entered_message(structure)
	else:
		show_structure_interaction_message(structure)

func show_structure_entered_message(structure):
	# Temporary feedback - replace with actual entering logic later
	print("You have entered ", structure.name)
	print("Population: ", structure.population)
	print("Services: ", structure.services)
	print("Shops: ", structure.shops)

func show_structure_interaction_message(structure):
	# Temporary feedback - replace with actual interaction logic later
	print("You interact with ", structure.name)
	print("Description: ", structure.description)
	if structure.guards > 0:
		print("Guards: ", structure.guards)

func setup_parallax_background():
	"""Setup parallax background with real cloud assets"""
	parallax_bg = ParallaxBackground.new()
	add_child(parallax_bg)
	# Move it to the beginning of the children list to ensure it renders first (behind everything)
	move_child(parallax_bg, 0)
	
	# Create multiple cloud layers for depth effect
	create_background_cloud_layer()  # Far background
	create_midground_cloud_layer()   # Middle layer
	create_foreground_cloud_layer()  # Close layer
	
	print("Parallax cloud system initialized with real cloud assets")

func create_background_cloud_layer():
	"""Create far background cloud layer"""
	var cloud_layer = ParallaxLayer.new()
	cloud_layer.motion_scale = Vector2(0.1, 0.1)  # Slowest movement
	cloud_layer.motion_mirroring = Vector2(2048, 1536)
	
	# Add multiple cloud sprites across the layer
	for i in range(8):  # 8 clouds in background
		var cloud_sprite = create_cloud_sprite(randi_range(1, 10))
		cloud_sprite.position = Vector2(
			randf_range(-1024, 1024),
			randf_range(-768, 768)
		)
		cloud_sprite.scale = Vector2(0.8, 0.8)  # Smaller for distance
		cloud_sprite.modulate = Color(0.9, 0.9, 1.0, 0.4)  # Faded and blue-tinted
		cloud_layer.add_child(cloud_sprite)
	
	parallax_bg.add_child(cloud_layer)

func create_midground_cloud_layer():
	"""Create middle distance cloud layer"""
	var cloud_layer = ParallaxLayer.new()
	cloud_layer.motion_scale = Vector2(0.3, 0.3)  # Medium movement
	cloud_layer.motion_mirroring = Vector2(1536, 1152)
	
	# Add clouds with medium size and opacity
	for i in range(6):  # 6 clouds in midground
		var cloud_sprite = create_cloud_sprite(randi_range(1, 10))
		cloud_sprite.position = Vector2(
			randf_range(-768, 768),
			randf_range(-576, 576)
		)
		cloud_sprite.scale = Vector2(1.0, 1.0)  # Normal size
		cloud_sprite.modulate = Color(0.95, 0.95, 1.0, 0.6)  # Semi-transparent
		cloud_layer.add_child(cloud_sprite)
	
	parallax_bg.add_child(cloud_layer)

func create_foreground_cloud_layer():
	"""Create close foreground cloud layer"""
	var cloud_layer = ParallaxLayer.new()
	cloud_layer.motion_scale = Vector2(0.5, 0.5)  # Fastest movement
	cloud_layer.motion_mirroring = Vector2(1024, 768)
	
	# Add fewer, larger, more visible clouds
	for i in range(4):  # 4 clouds in foreground
		var cloud_sprite = create_cloud_sprite(randi_range(1, 10))
		cloud_sprite.position = Vector2(
			randf_range(-512, 512),
			randf_range(-384, 384)
		)
		cloud_sprite.scale = Vector2(1.2, 1.2)  # Larger for closeness
		cloud_sprite.modulate = Color(1.0, 1.0, 1.0, 0.8)  # More opaque
		cloud_layer.add_child(cloud_sprite)
	
	parallax_bg.add_child(cloud_layer)

func create_cloud_sprite(cloud_number: int) -> Sprite2D:
	"""Create a cloud sprite from the numbered cloud assets"""
	var sprite = Sprite2D.new()
	var cloud_path = "res://assets/clouds/cloud_" + str(cloud_number) + ".png"
	sprite.texture = load(cloud_path)
	sprite.z_index = -10  # Behind everything
	return sprite

func setup_cloud_manager():
	"""Setup optimized cloud management system using singleton"""
	# CloudManager is now a singleton - just configure it for the main scene
	CloudManager.set_camera_reference(camera)
	CloudManager.set_player_reference(player)
	
	# Connect performance monitoring
	CloudManager.clouds_visibility_changed.connect(_on_clouds_visibility_changed)
	
	print("Advanced cloud management system configured for main scene")

func setup_structure_interior_overlay():
	"""Setup the simple structure interior overlay system with error handling"""
	print("MAIN: Setting up structure interior overlay...")
	
	# Create a CanvasLayer to ensure the overlay renders on top
	var canvas_layer = CanvasLayer.new()
	canvas_layer.name = "OverlayLayer"
	canvas_layer.layer = 100  # High layer to render on top
	add_child(canvas_layer)
	
	# Create overlay instance
	structure_interior_overlay = StructureInteriorOverlay.new()
	
	if not structure_interior_overlay:
		print("ERROR: Failed to create StructureInteriorOverlay instance")
		return
		
	structure_interior_overlay.name = "StructureInteriorOverlay"
	
	print("MAIN: Adding overlay to canvas layer...")
	# Add to canvas layer instead of directly to scene
	canvas_layer.add_child(structure_interior_overlay)
	
	# Verify it was added successfully
	if not structure_interior_overlay.is_inside_tree():
		print("ERROR: Failed to add overlay to scene tree")
		structure_interior_overlay = null
		return
	
	print("MAIN: Overlay added successfully, connecting signals...")
	# Connect exit signal safely
	if structure_interior_overlay.has_signal("exit_requested"):
		structure_interior_overlay.exit_requested.connect(_on_interior_overlay_exit)
		print("MAIN: Exit signal connected successfully")
	else:
		print("WARNING: exit_requested signal not found on overlay")
	
	print("MAIN: Structure interior overlay system initialized successfully")
	print("MAIN: Overlay position: ", structure_interior_overlay.position, " size: ", structure_interior_overlay.size)

func _on_interior_overlay_exit():
	"""Called when player exits structure interior overlay"""
	print("Player exited structure interior")
	# Overlay handles hiding itself, nothing else needed


func _on_clouds_visibility_changed(visible_count: int):
	"""Called when cloud visibility changes - for performance monitoring"""
	# Optionally adjust other systems based on cloud load
	if visible_count > 15:
		# Too many clouds visible, could reduce other effects
		pass

func update_ship_wind_effects(is_moving: bool):
	"""Update ship wind particle effects based on movement state"""
	if player_ship:
		var velocity = Vector2.ZERO
		if is_moving and player_movement:
			# Calculate velocity based on movement direction and speed
			var current_pos = player_movement.get_current_position()
			var target_pos = player_movement.get_target_position()
			var movement_vector = target_pos - current_pos
			velocity = Vector2(movement_vector.x, movement_vector.y) * 50.0  # Scale for visual effect
		
		player_ship.update_wind_effects(velocity, is_moving)

func track_movement_distance():
	"""Track distance traveled and deplete energy based on actual movement"""
	if not Global.player or not Global.player.stats:
		return
	
	# Initialize last position if not set
	if last_player_position == Vector2.ZERO:
		last_player_position = player.position
		return
	
	# Calculate distance moved since last frame
	var current_position = player.position
	var distance_this_frame = last_player_position.distance_to(current_position)
	
	if distance_this_frame > 0.1:  # Only count meaningful movement (avoid tiny floating point changes)
		total_distance_traveled += distance_this_frame
		
		# Check if we should deduct energy
		if total_distance_traveled >= ENERGY_COST_DISTANCE:
			var energy_to_deduct = int(total_distance_traveled / ENERGY_COST_DISTANCE)
			total_distance_traveled = fmod(total_distance_traveled, ENERGY_COST_DISTANCE)  # Keep remainder
			
			handle_movement_costs(energy_to_deduct)
	
	last_player_position = current_position

func handle_movement_costs(energy_cost: int = 1):
	"""Handle energy depletion and health costs for player movement"""
	if not Global.player or not Global.player.stats:
		return
	
	var player_stats = Global.player.stats
	
	for i in range(energy_cost):
		var was_exhausted = player_stats.is_exhausted()
		
		print("Distance-based energy depletion - Total distance: ", total_distance_traveled + ENERGY_COST_DISTANCE)
		print("Before depletion - Energy: ", player_stats.energy, " Health: ", player_stats.health)
		
		# Deplete energy first, then health if exhausted
		player_stats.deplete_energy_or_health(1, 1)
		
		print("After depletion - Energy: ", player_stats.energy, " Health: ", player_stats.health)
		
		if was_exhausted:
			print("No energy! Health depleted: ", player_stats.health, "/", player_stats.max_health)
			# Check if player died
			if player_stats.health <= 0:
				handle_player_death()
		else:
			print("Energy depleted: ", player_stats.energy, "/", player_stats.max_energy)

func handle_player_death():
	"""Handle when player's health reaches zero"""
	print("Player has died from exhaustion!")
	# TODO: Implement death mechanics (game over screen, respawn, etc.)
	# For now, just restore some health to prevent softlock
	Global.player.stats.health = 10
	print("Emergency health restore activated!")

func update_parallax_effects():
	"""Update parallax background effects based on camera movement"""
	if parallax_bg:
		# Update scroll offset for parallax effect
		parallax_bg.scroll_offset = camera.position
	
	# Cloud system now moves independently - no manual updates needed

func open_settings_dialogue():
	"""Open the settings menu using SettingsManager"""
	SettingsManager.open_settings_with_callback(self, _on_settings_closed)

func _on_settings_closed():
	"""Called when settings menu is closed"""
	print("Settings menu closed in game")

func fire_player_spear():
	"""Fire a spear from the player ship at the nearest enemy"""
	if not spear_pool:
		print("SpearPool not available!")
		return
	
	var player_world_pos = player.position
	var target = find_nearest_enemy_target(player_world_pos)
	
	if target:
		# Calculate spawn position in front of the ship
		var direction_to_target = (target.position - player_world_pos).normalized()
		var spawn_offset = 30.0  # Distance from ship center
		var spear_spawn_pos = player_world_pos + direction_to_target * spawn_offset
		
		var success = spear_pool.launch_spear(
			spear_spawn_pos,
			target.position,
			400.0,  # Speed
			2,      # Damage
			player  # Owner
		)
		
		if success:
			print("Player fired spear at ", target.name if target.has_method("get_name") else "enemy")
		else:
			print("No spears available in pool!")
	else:
		print("No valid targets found for spear!")

func find_nearest_enemy_target(from_pos: Vector2) -> Node2D:
	"""Find the nearest enemy target within spear range"""
	var nearest_target: Node2D = null
	var nearest_distance: float = INF
	var max_range: float = 300.0  # Maximum spear range
	
	# Check NPCs (enemy ships)
	var npcs = World.get_npcs()
	for npc in npcs:
		if npc and is_instance_valid(npc):
			var distance = from_pos.distance_to(npc.position)
			if distance <= max_range and distance < nearest_distance:
				nearest_target = npc
				nearest_distance = distance
	
	# Check dragons
	var dragons = World.get_dragons()
	for dragon in dragons:
		if dragon and is_instance_valid(dragon):
			var distance = from_pos.distance_to(dragon.position)
			if distance <= max_range and distance < nearest_distance:
				nearest_target = dragon
				nearest_distance = distance
	
	return nearest_target

func show_aim_cursor():
	"""Show the aim cursor pointing at nearest target"""
	if not aim_cursor or not aim_line:
		return
	
	var player_world_pos = player.position
	var target = find_nearest_enemy_target(player_world_pos)
	
	if target:
		aim_cursor.visible = true
		aim_cursor.position = Vector2.ZERO  # Reset position
		
		# Update aim line - make it relative to aim_cursor position
		aim_line.clear_points()
		aim_line.add_point(player_world_pos)
		aim_line.add_point(target.position)
		aim_line.default_color = Color(1.0, 0.3, 0.3, 0.7)  # Red when target found
		
		# Add a target indicator at the target position
		var target_indicator = aim_cursor.get_node_or_null("TargetCircle")
		if target_indicator:
			target_indicator.position = target.position
			target_indicator.queue_redraw()  # Force redraw
	else:
		# Show cursor but indicate no target
		aim_cursor.visible = true
		aim_cursor.position = Vector2.ZERO
		
		# Show a short line in the direction the player is facing
		aim_line.clear_points()
		aim_line.add_point(player_world_pos)
		# Point forward from player
		var forward_pos = player_world_pos + Vector2(100, 0)  # Default right
		if player_ship and player_ship.rotation != 0:
			var direction = Vector2.from_angle(player_ship.rotation - PI/2)
			forward_pos = player_world_pos + direction * 100
		aim_line.add_point(forward_pos)
		aim_line.default_color = Color(0.5, 0.5, 0.5, 0.5)  # Gray when no target

func hide_aim_cursor():
	"""Hide the aim cursor"""
	if aim_cursor:
		aim_cursor.visible = false

func setup_settings_button():
	"""Setup a simple settings button in the top-right corner"""
	# Create a CanvasLayer to ensure button is always on top
	var ui_layer = CanvasLayer.new()
	ui_layer.name = "SettingsUI"
	ui_layer.layer = 100
	add_child(ui_layer)
	
	# Create the settings button
	settings_button = Button.new()
	settings_button.text = "⚙ Settings"
	settings_button.custom_minimum_size = Vector2(120, 40)
	
	# Ensure button properly blocks mouse input
	settings_button.mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Position in top-right corner
	settings_button.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	settings_button.position = Vector2(-140, 20)  # 20px from top, 140px from right
	
	# Style the button
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
	
	# Connect button signal
	settings_button.pressed.connect(_on_settings_button_pressed)
	
	# Add to UI layer
	ui_layer.add_child(settings_button)
	
	print("Settings button created in top-right corner")

func _on_settings_button_pressed():
	"""Called when settings button is pressed"""
	open_settings_dialogue()
