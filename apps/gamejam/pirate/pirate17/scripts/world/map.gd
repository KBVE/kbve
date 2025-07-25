extends Node

signal tile_changed(x: int, y: int, color: String)

var tiles: Dictionary = {}
var map_size: Vector2i = Vector2i(200, 200)

var tile_colors = {
	"lake": "#4A90E2",
	"ocean": "#1E3A8A",
	"land": "#8DB600", 
	"sand": "#F5A623",
	"forest": "#228B22",
	"mountain": "#8B4513",
	"grass": "#7CFC00"
}

var passable_tiles = ["lake", "land", "sand", "forest", "mountain", "grass"]

func _ready():
	generate_initial_map()

func generate_initial_map():
	generate_ocean_border()
	
	generate_base_terrain()
	
	generate_mountains()
	
	generate_beaches()
	
	generate_forests()

func generate_ocean_border():
	var coastline_noise = FastNoiseLite.new()
	coastline_noise.seed = randi()
	coastline_noise.frequency = 0.08
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			var distance_to_edge = min(min(x, map_size.x - 1 - x), min(y, map_size.y - 1 - y))
			var noise_value = coastline_noise.get_noise_2d(x, y)
			
			var coastline_depth = 8 + int(noise_value * 6)
			
			if distance_to_edge < coastline_depth:
				var coast_noise = coastline_noise.get_noise_2d(x * 2, y * 2)
				if distance_to_edge < coastline_depth - 3 or coast_noise < 0.2:
					set_tile(x, y, tile_colors["ocean"])
				else:
					set_tile(x, y, tile_colors["grass"])
			else:
				set_tile(x, y, tile_colors["grass"])

func generate_base_terrain():
	var noise = FastNoiseLite.new()
	noise.seed = randi()
	noise.frequency = 0.1
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			if get_tile(x, y) != tile_colors["ocean"]:
				var noise_value = noise.get_noise_2d(x, y)
				
				if noise_value < -0.2:
					set_tile(x, y, tile_colors["lake"])
				else:
					set_tile(x, y, tile_colors["grass"])

func generate_mountains():
	var mountain_noise = FastNoiseLite.new()
	mountain_noise.seed = randi()
	mountain_noise.frequency = 0.05
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			if get_tile(x, y) == tile_colors["grass"]:
				var mountain_value = mountain_noise.get_noise_2d(x, y)
				if mountain_value > 0.4:
					set_tile(x, y, tile_colors["mountain"])

func generate_beaches():
	for x in range(map_size.x):
		for y in range(map_size.y):
			if get_tile(x, y) == tile_colors["grass"]:
				var neighbors = get_neighbors(x, y)
				var near_water = false
				
				for neighbor_pos in neighbors:
					var tile = get_tile(neighbor_pos.x, neighbor_pos.y)
					if tile == tile_colors["lake"] or tile == tile_colors["ocean"]:
						near_water = true
						break
				
				if near_water:
					set_tile(x, y, tile_colors["sand"])

func generate_forests():
	var forest_noise = FastNoiseLite.new()
	forest_noise.seed = randi()
	forest_noise.frequency = 0.15
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			if get_tile(x, y) == tile_colors["grass"]:
				var forest_value = forest_noise.get_noise_2d(x, y)
				if forest_value > 0.3:
					set_tile(x, y, tile_colors["forest"])

func set_tile(x: int, y: int, color: String):
	var key = Vector2i(x, y)
	tiles[key] = color
	tile_changed.emit(x, y, color)

func get_tile(x: int, y: int) -> String:
	var key = Vector2i(x, y)
	return tiles.get(key, tile_colors["ocean"])

func is_tile_passable(x: int, y: int) -> bool:
	var tile_color = get_tile(x, y)
	for tile_type in passable_tiles:
		if tile_color == tile_colors[tile_type]:
			return true
	return false

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