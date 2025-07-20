extends Node2D

const Movement = preload("res://scripts/world/movement.gd")
const BorderSlicer = preload("res://scripts/ui/border_slicer.gd")

@onready var camera = $Camera2D
@onready var map_container = $MapContainer
@onready var player = $Player
@onready var path_line = $PathVisualizer/PathLine
@onready var target_highlight = $PathVisualizer/TargetHighlight
@onready var ui_player_name = $UI/PlayerInfo/PlayerName
@onready var ui_health_value = $UI/PlayerInfo/HealthBar/HealthValue
@onready var ui_mana_value = $UI/PlayerInfo/ManaBar/ManaValue
@onready var ui_energy_value = $UI/PlayerInfo/EnergyBar/EnergyValue

const TILE_SIZE = 32
var tile_sprites = {}
var player_movement: Movement.MoveComponent

func _ready():
	# Load border assets first
	BorderSlicer.load_and_slice_borders()
	
	generate_map_display()
	setup_player_movement()
	update_ui()
	connect_player_stats()
	connect_movement_signals()
	setup_target_highlight()

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
		
		if new_pos != current_pos:
			player_movement.move_to(new_pos, true)  # Immediate movement for WASD
	
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var mouse_world_pos = get_global_mouse_position()
		var grid_pos = Movement.get_grid_position(mouse_world_pos)
		
		player_movement.move_to(grid_pos, false)  # Smooth movement for clicks

func _process(delta):
	player_movement.process_movement(delta)
	camera.position = player.position
	update_movement_path()

func connect_movement_signals():
	player_movement.movement_started.connect(_on_movement_started)
	player_movement.movement_finished.connect(_on_movement_finished)

func _on_movement_started(entity: Node2D, from: Vector2i, to: Vector2i):
	if entity == player:
		show_movement_path(from, to)

func _on_movement_finished(entity: Node2D, at: Vector2i):
	if entity == player:
		hide_movement_path()

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
	target_highlight.position = world_pos
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
	var direction = (end - start).normalized()
	var distance = start.distance_to(end)
	var dash_length = 15.0  # Length of each dash
	var gap_length = 10.0   # Length of each gap
	var current_distance = 0.0
	
	# Create individual dash segments
	while current_distance < distance:
		var dash_start = start + direction * current_distance
		var dash_end_distance = min(current_distance + dash_length, distance)
		var dash_end = start + direction * dash_end_distance
		
		# Add this dash segment (pair of points)
		path_line.add_point(dash_start)
		path_line.add_point(dash_end)
		
		# Move to start of next dash
		current_distance += dash_length + gap_length

func hide_movement_path():
	path_line.clear_points()
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
