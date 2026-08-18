extends GdUnitTestSuite


const FLORA := "res://assets/environment/props/flora/"
const CUTOUT_SHADERS: Array[String] = ["tree.gdshader", "tree_leaf.gdshader"]


func _source(name: String) -> String:
	var file := FileAccess.open(FLORA + name, FileAccess.READ)
	assert_object(file).is_not_null()
	return file.get_as_text()


func test_cutout_shaders_declare_the_view_position_global() -> void:
	for name in CUTOUT_SHADERS:
		assert_str(_source(name)).contains("global uniform vec3 view_position;")


func test_no_discard_runs_before_the_color_pass_is_confirmed() -> void:
	for name in CUTOUT_SHADERS:
		var lines := _source(name).split("\n")
		var guard := -1
		for i in lines.size():
			var line: String = lines[i]
			if guard < 0 and line.contains("view_position") and line.contains("distance("):
				guard = i
			if line.strip_edges().begins_with("discard"):
				assert_int(guard).override_failure_message(
					"%s line %d discards outside the color-pass guard" % [name, i + 1]
				).is_greater(-1)


func test_the_leaf_occlusion_fade_reads_the_real_camera() -> void:
	var body := _source("tree_leaf.gdshader").split("void fragment()")[1]
	var guard := body.find("view_position")
	var first_camera_use := body.find("CAMERA_POSITION_WORLD", guard + 1)
	assert_int(guard).is_greater(-1)
	assert_int(first_camera_use).is_greater(guard)


func _view_globals() -> Node:
	var globals: Node = load("res://src/autoload/view_globals.gd").new()
	auto_free(globals)
	add_child(globals)
	return globals


func test_view_globals_reports_the_active_camera() -> void:
	var globals := _view_globals()
	var camera := Camera3D.new()
	auto_free(camera)
	add_child(camera)
	camera.global_position = Vector3(3.0, 4.0, 5.0)
	camera.make_current()
	var reported: Vector3 = globals.camera_position()
	assert_vector(reported).is_equal_approx(Vector3(3.0, 4.0, 5.0), Vector3.ONE * 0.001)


func test_the_no_camera_fallback_cannot_be_mistaken_for_one() -> void:
	var globals := _view_globals()
	var nowhere: Vector3 = globals.NOWHERE
	assert_float(nowhere.distance_to(Vector3.ZERO)).is_greater(100000.0)
