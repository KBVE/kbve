extends Node

func _ready():
	get_window().unfocusable = true
	var scene = load("res://scenes/main.tscn").instantiate()
	add_child(scene)
	for i in range(40):
		await get_tree().process_frame
	var terrain = scene.get_node("Terrain")
	var probe_z := 20.0
	var best_x := 0.0
	var best_h := 1e9
	for i in range(-110, 111, 2):
		var h = terrain.height_at(float(i), probe_z)
		if h < best_h:
			best_h = h
			best_x = float(i)
	print("river center x=", best_x, " h=", best_h)
	var bed_mat = terrain.get("riverbed_material")
	print("bed mat=", bed_mat)
	if bed_mat:
		print("bed heightmap=", bed_mat.get_shader_parameter("heightmap"))
		print("bed water=", bed_mat.get_shader_parameter("water_level"))
	var bed_node = terrain.get_node_or_null("Riverbed")
	print("bed node=", bed_node)
	var cam = Camera3D.new()
	scene.add_child(cam)
	cam.global_position = Vector3(best_x + 3.0, best_h + 20.0, probe_z + 8.0)
	cam.look_at(Vector3(best_x, best_h, probe_z - 6.0), Vector3.UP)
	cam.current = true
	for i in range(30):
		await get_tree().process_frame
	var img = get_viewport().get_texture().get_image()
	img.save_png("/private/tmp/claude-501/-Users-alappatel-Documents-GitHub-kbve/90b2dafb-5498-4e2a-926e-1048053031a6/scratchpad/riverbed_wide.png")
	var bank_x := best_x
	var bank_h := best_h
	for i in range(0, 60):
		var x = best_x + float(i) * 0.5
		var h = terrain.height_at(x, probe_z)
		if h > -1.4 + 0.3 and h < -1.4 + 0.8:
			bank_x = x
			bank_h = h
			break
	print("bank x=", bank_x, " h=", bank_h)
	cam.global_position = Vector3(bank_x + 1.5, bank_h + 2.0, probe_z + 1.5)
	cam.look_at(Vector3(bank_x, bank_h, probe_z), Vector3.UP)
	for i in range(20):
		await get_tree().process_frame
	img = get_viewport().get_texture().get_image()
	img.save_png("/private/tmp/claude-501/-Users-alappatel-Documents-GitHub-kbve/90b2dafb-5498-4e2a-926e-1048053031a6/scratchpad/riverbed_close.png")
	cam.global_position = Vector3(best_x, -1.4 - 0.4, probe_z)
	cam.look_at(Vector3(best_x + 2.0, best_h, probe_z - 3.0), Vector3.UP)
	for i in range(20):
		await get_tree().process_frame
	img = get_viewport().get_texture().get_image()
	img.save_png("/private/tmp/claude-501/-Users-alappatel-Documents-GitHub-kbve/90b2dafb-5498-4e2a-926e-1048053031a6/scratchpad/riverbed_under.png")
	get_tree().quit()
