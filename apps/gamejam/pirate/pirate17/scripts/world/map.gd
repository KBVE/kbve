extends Node

signal tile_changed(x: int, y: int, color: String)

var tiles: Dictionary = {}
var map_size: Vector2i = Vector2i(100, 100)

var tile_colors = {
	"water": "#4A90E2",
	"land": "#8DB600", 
	"sand": "#F5A623",
	"forest": "#228B22",
	"mountain": "#8B4513",
	"grass": "#7CFC00"
}

func _ready():
	generate_initial_map()

func generate_initial_map():
	for x in range(map_size.x):
		for y in range(map_size.y):
			var tile_type = get_random_tile_type()
			set_tile(x, y, tile_colors[tile_type])

func get_random_tile_type() -> String:
	var types = tile_colors.keys()
	return types[randi() % types.size()]

func set_tile(x: int, y: int, color: String):
	var key = Vector2i(x, y)
	tiles[key] = color
	tile_changed.emit(x, y, color)

func get_tile(x: int, y: int) -> String:
	var key = Vector2i(x, y)
	return tiles.get(key, tile_colors["water"])

func is_valid_position(x: int, y: int) -> bool:
	return x >= 0 and x < map_size.x and y >= 0 and y < map_size.y

func get_neighbors(x: int, y: int) -> Array:
	var neighbors = []
	var directions = [
		Vector2i(-1, -1), Vector2i(0, -1), Vector2i(1, -1),
		Vector2i(-1, 0),                    Vector2i(1, 0),
		Vector2i(-1, 1),  Vector2i(0, 1),  Vector2i(1, 1)
	]
	
	for dir in directions:
		var nx = x + dir.x
		var ny = y + dir.y
		if is_valid_position(nx, ny):
			neighbors.append(Vector2i(nx, ny))
	
	return neighbors