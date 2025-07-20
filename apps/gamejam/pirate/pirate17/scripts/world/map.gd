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
	# Step 1: Create base terrain (ocean vs land)
	generate_base_terrain()
	
	# Step 2: Add mountain ranges
	generate_mountains()
	
	# Step 3: Add beaches/sand near water
	generate_beaches()
	
	# Step 4: Add forests to grasslands
	generate_forests()

func generate_base_terrain():
	var noise = FastNoiseLite.new()
	noise.seed = randi()
	noise.frequency = 0.1
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			var noise_value = noise.get_noise_2d(x, y)
			
			# Use noise to determine land vs water
			# Values < -0.2 = water, >= -0.2 = land
			if noise_value < -0.2:
				set_tile(x, y, tile_colors["water"])
			else:
				set_tile(x, y, tile_colors["grass"])

func generate_mountains():
	var mountain_noise = FastNoiseLite.new()
	mountain_noise.seed = randi()
	mountain_noise.frequency = 0.05
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			# Only place mountains on land
			if get_tile(x, y) != tile_colors["water"]:
				var mountain_value = mountain_noise.get_noise_2d(x, y)
				if mountain_value > 0.4:
					set_tile(x, y, tile_colors["mountain"])

func generate_beaches():
	for x in range(map_size.x):
		for y in range(map_size.y):
			# Only process land tiles
			if get_tile(x, y) != tile_colors["water"]:
				# Check if adjacent to water
				var neighbors = get_neighbors(x, y)
				var near_water = false
				
				for neighbor_pos in neighbors:
					if get_tile(neighbor_pos.x, neighbor_pos.y) == tile_colors["water"]:
						near_water = true
						break
				
				# Convert grassland near water to sand
				if near_water and get_tile(x, y) == tile_colors["grass"]:
					set_tile(x, y, tile_colors["sand"])

func generate_forests():
	var forest_noise = FastNoiseLite.new()
	forest_noise.seed = randi()
	forest_noise.frequency = 0.15
	
	for x in range(map_size.x):
		for y in range(map_size.y):
			# Only add forests to grassland
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