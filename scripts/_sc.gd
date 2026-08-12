extends SceneTree
func _init() -> void:
	var main: Node = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	await create_timer(2.0).timeout
	var sf: Node = main.get_node("StoneField")
	print("STATS: ", sf.get_stone_stats())
	quit()
