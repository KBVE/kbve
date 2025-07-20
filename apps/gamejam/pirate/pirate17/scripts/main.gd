extends Node2D

@onready var camera = $Camera2D
@onready var map_container = $MapContainer
@onready var player = $Player
@onready var ui_player_name = $UI/PlayerInfo/PlayerName
@onready var ui_health_value = $UI/PlayerInfo/HealthBar/HealthValue
@onready var ui_mana_value = $UI/PlayerInfo/ManaBar/ManaValue
@onready var ui_energy_value = $UI/PlayerInfo/EnergyBar/EnergyValue

const TILE_SIZE = 32
const MOVE_SPEED = 200.0
var tile_sprites = {}
var player_grid_pos = Vector2i(50, 50)
var target_position = Vector2.ZERO
var is_moving = false
var movement_path = []

func _ready():
	generate_map_display()
	position_player()
	camera.position = player.position
	update_ui()
	connect_player_stats()

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

func position_player():
	var world_pos = Vector2(
		player_grid_pos.x * TILE_SIZE + TILE_SIZE / 2,
		player_grid_pos.y * TILE_SIZE + TILE_SIZE / 2
	)
	player.position = world_pos

func _input(event):
	if event is InputEventKey and event.pressed:
		var new_pos = player_grid_pos
		
		match event.keycode:
			KEY_W, KEY_UP:
				new_pos.y -= 1
			KEY_S, KEY_DOWN:
				new_pos.y += 1
			KEY_A, KEY_LEFT:
				new_pos.x -= 1
			KEY_D, KEY_RIGHT:
				new_pos.x += 1
		
		if World.is_valid_position(new_pos.x, new_pos.y):
			player_grid_pos = new_pos
			position_player()
			camera.position = player.position
	
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and not is_moving:
		var mouse_world_pos = get_global_mouse_position()
		var grid_pos = Vector2i(
			int(mouse_world_pos.x / TILE_SIZE),
			int(mouse_world_pos.y / TILE_SIZE)
		)
		
		if World.is_valid_position(grid_pos.x, grid_pos.y):
			start_movement_to(grid_pos)

func _process(delta):
	if is_moving:
		var distance = player.position.distance_to(target_position)
		if distance < 5.0:
			player.position = target_position
			is_moving = false
			camera.position = player.position
		else:
			var direction = (target_position - player.position).normalized()
			player.position += direction * MOVE_SPEED * delta
			camera.position = player.position

func start_movement_to(grid_pos: Vector2i):
	player_grid_pos = grid_pos
	target_position = Vector2(
		grid_pos.x * TILE_SIZE + TILE_SIZE / 2,
		grid_pos.y * TILE_SIZE + TILE_SIZE / 2
	)
	is_moving = true

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