extends Node


# Called when the node enters the scene tree for the first time.
func _ready():
	call_deferred("_initialize_grid_map_node")

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass

func _initialize_grid_map_node():
	print("GridMapNode is now fully added to the scene tree.")
	# Add your initialization logic here
	var hex_grid_scene = HexGridScene.new()
	if hex_grid_scene:
		print("Hex Grid Scene instance created successfully.")
		add_child(hex_grid_scene)
