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
@onready var ui_player_name = $UI/PlayerInfo/PlayerName
@onready var ui_health_value = $UI/PlayerInfo/HealthBar/HealthValue
@onready var ui_mana_value = $UI/PlayerInfo/ManaBar/ManaValue
@onready var ui_energy_value = $UI/PlayerInfo/EnergyBar/EnergyValue

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

func _ready():
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
	spawn_npcs()
	update_ui()
	connect_player_stats()
	connect_movement_signals()
	connect_ship_signals()
	setup_target_highlight()
	setup_interaction_system()
	setup_parallax_background()

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
	player_movement = Movement.MoveComponent.new(player, Vector2i(50, 50))
	camera.position = player.position

func generate_map_display():
	var map_size = World.get_map_size()
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			var tile_color = World.get_tile_at(x, y)
			create_tile_sprite(x, y, tile_color)

func create_tile_sprite(x: int, y: int, color_hex: String):
	var tile = ColorRect.new()
	tile.size = Vector2(TILE_SIZE, TILE_SIZE)
	tile.position = Vector2(x * TILE_SIZE, y * TILE_SIZE)
	tile.color = Color(color_hex)
	
	map_container.add_child(tile)
	tile_sprites[Vector2i(x, y)] = tile

func _input(event):
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
		
		if new_pos != current_pos:
			initiate_movement_with_rotation(current_pos, new_pos, true)  # WASD movement
	
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var mouse_world_pos = get_global_mouse_position()
		var grid_pos = Movement.get_grid_position(mouse_world_pos)
		var current_pos = player_movement.get_current_position()
		
		initiate_movement_with_rotation(current_pos, grid_pos, false)  # Click movement

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

func update_ui():
	ui_player_name.text = Global.player.player_name
	ui_health_value.text = str(Global.player.stats.health) + "/" + str(Global.player.stats.max_health)
	ui_mana_value.text = str(Global.player.stats.mana) + "/" + str(Global.player.stats.max_mana)
	ui_energy_value.text = str(Global.player.stats.energy) + "/" + str(Global.player.stats.max_energy)

func connect_player_stats():
	Global.player.stats.health_changed.connect(_on_health_changed)
	Global.player.stats.mana_changed.connect(_on_mana_changed)
	Global.player.stats.energy_changed.connect(_on_energy_changed)

func _on_health_changed(new_value: int, max_value: int):
	ui_health_value.text = str(new_value) + "/" + str(max_value)

func _on_mana_changed(new_value: int, max_value: int):
	ui_mana_value.text = str(new_value) + "/" + str(max_value)

func _on_energy_changed(new_value: int, max_value: int):
	ui_energy_value.text = str(new_value) + "/" + str(max_value)

func setup_npc_container():
	npc_container = Node2D.new()
	npc_container.name = "NPCs"
	add_child(npc_container)

func spawn_npcs():
	print("Starting NPC spawn process...")
	# Spawn NPCs through World system
	World.spawn_npcs(15)
	
	# Add spawned NPCs to the scene
	var npc_list = World.get_npcs()
	print("Retrieved ", npc_list.size(), " NPCs from World")
	
	for npc in npc_list:
		# Add to scene first, then ensure position is set correctly
		npc_container.add_child(npc)
		# Force update position after being added to scene tree
		npc.update_position_after_scene_ready()
		print("Added NPC to scene at world position: ", npc.position)

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
	interaction_tooltip.interaction_requested.connect(_on_structure_interaction_requested)
	
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
	print("Interacting with structure: ", structure.name, " (", structure.type, ")")
	
	# Hide the tooltip
	interaction_tooltip.hide_tooltip()
	
	# Handle different types of interactions
	if structure.is_enterable:
		print("Entering ", structure.name, "...")
		# TODO: Implement structure entering (scene change, interior view, etc.)
		show_structure_entered_message(structure)
	else:
		print("Interacting with ", structure.name, "...")
		# TODO: Implement non-enterable interactions (talk, trade, etc.)
		show_structure_interaction_message(structure)
	
	# Call the world interaction system
	World.interact_with_structure_at(structure.grid_position, player)

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
	"""Setup parallax background for atmospheric effects"""
	parallax_bg = ParallaxBackground.new()
	add_child(parallax_bg)
	# Move it to the beginning of the children list to ensure it renders first (behind everything)
	move_child(parallax_bg, 0)
	
	# Create a simple cloud layer
	var cloud_layer = ParallaxLayer.new()
	cloud_layer.motion_scale = Vector2(0.2, 0.2)  # Slow parallax movement
	cloud_layer.motion_mirroring = Vector2(1024, 1024)
	
	# Create simple cloud sprites
	var cloud_sprite = create_simple_cloud_texture()
	cloud_layer.add_child(cloud_sprite)
	parallax_bg.add_child(cloud_layer)
	
	print("Parallax background system initialized")

func create_simple_cloud_texture() -> Sprite2D:
	"""Create a simple cloud texture"""
	var sprite = Sprite2D.new()
	
	# Create a simple cloud texture procedurally
	var size = 512
	var image = Image.create(size, size, false, Image.FORMAT_RGBA8)
	
	# Simple cloud pattern using random circles
	for i in range(20):
		var center_x = randi_range(0, size)
		var center_y = randi_range(0, size)
		var radius = randi_range(30, 80)
		
		for x in range(max(0, center_x - radius), min(size, center_x + radius)):
			for y in range(max(0, center_y - radius), min(size, center_y + radius)):
				var distance = Vector2(x - center_x, y - center_y).length()
				if distance < radius:
					var alpha = (1.0 - distance / radius) * 0.3
					var cloud_color = Color(0.9, 0.9, 1.0, alpha)
					image.set_pixel(x, y, cloud_color)
	
	var texture = ImageTexture.new()
	texture.set_image(image)
	sprite.texture = texture
	sprite.position = Vector2.ZERO
	
	return sprite

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

func update_parallax_effects():
	"""Update parallax background effects based on camera movement"""
	if parallax_bg:
		# Update scroll offset for parallax effect
		parallax_bg.scroll_offset = camera.position
