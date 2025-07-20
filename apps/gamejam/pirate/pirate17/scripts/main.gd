extends Node2D

const Movement = preload("res://scripts/world/movement.gd")

@onready var camera = $Camera2D
@onready var map_container = $MapContainer
@onready var player = $Player
@onready var ui_player_name = $UI/PlayerInfo/PlayerName
@onready var ui_health_value = $UI/PlayerInfo/HealthBar/HealthValue
@onready var ui_mana_value = $UI/PlayerInfo/ManaBar/ManaValue
@onready var ui_energy_value = $UI/PlayerInfo/EnergyBar/EnergyValue

const TILE_SIZE = 32
var tile_sprites = {}
var player_movement: Movement.MoveComponent

func _ready():
	generate_map_display()
	setup_player_movement()
	update_ui()
	connect_player_stats()
	connect_movement_signals()

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

func connect_movement_signals():
	player_movement.movement_started.connect(_on_movement_started)
	player_movement.movement_finished.connect(_on_movement_finished)

func _on_movement_started(entity: Node2D, from: Vector2i, to: Vector2i):
	if entity == player:
		pass  # Can add movement start effects here

func _on_movement_finished(entity: Node2D, at: Vector2i):
	if entity == player:
		pass  # Can add movement finish effects here

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
