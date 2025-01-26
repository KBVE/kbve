extends Node


# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	var hex_grid_scene = HexGridScene.new()
	if hex_grid_scene:
		print("Hex Grid Scene instance created successfully.")
		add_child(hex_grid_scene)
	pass # Replace with function body.


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass
