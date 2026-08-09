@tool
extends EditorScenePostImport

const TEX_DIR := "res://assets/environment/props/flora/euonymus/"

var _cache := {}


func _post_import(scene: Node) -> Object:
	_walk(scene)
	return scene


func _walk(node: Node) -> void:
	var mi := node as MeshInstance3D
	if mi and mi.mesh:
		for i in mi.mesh.get_surface_count():
			var src := mi.mesh.surface_get_material(i)
			if src:
				mi.mesh.surface_set_material(i, _convert(src.resource_name))
	for child in node.get_children():
		_walk(child)


func _convert(mat_name: String) -> Material:
	if _cache.has(mat_name):
		return _cache[mat_name]
	var base := mat_name.trim_prefix("SH06_").trim_suffix("_SHD")
	var suffix := ""
	for s in ["_su", "_au", "_sp"]:
		if base.ends_with(s):
			suffix = s
			base = base.trim_suffix(s)
			break
	if suffix == "":
		suffix = "_su"
	var dif := _first(["SH06_%sFront_dif%s.png" % [base, suffix], "SH06_%s_dif%s.png" % [base, suffix]])
	var alp := _first(["SH06_%s_alp%s.png" % [base, suffix]])
	var m := ShaderMaterial.new()
	m.resource_name = mat_name
	if dif != "" and alp != "":
		m.shader = load("res://assets/fx/shaders/toon_foliage.gdshader")
		m.set_shader_parameter("albedo_tex", _compose(dif, alp))
	else:
		m.shader = load("res://assets/fx/shaders/toon.gdshader")
		if dif != "":
			m.set_shader_parameter("albedo_tex", load(dif))
	_cache[mat_name] = m
	return m


func _first(names: Array) -> String:
	for n in names:
		if ResourceLoader.exists(TEX_DIR + n):
			return TEX_DIR + n
	return ""


func _compose(dif_path: String, alp_path: String) -> Texture2D:
	var d := Image.load_from_file(ProjectSettings.globalize_path(dif_path))
	var a := Image.load_from_file(ProjectSettings.globalize_path(alp_path))
	d.convert(Image.FORMAT_RGBA8)
	a.convert(Image.FORMAT_RGBA8)
	if a.get_size() != d.get_size():
		a.resize(d.get_width(), d.get_height())
	for y in d.get_height():
		for x in d.get_width():
			var c := d.get_pixel(x, y)
			c.a = a.get_pixel(x, y).r
			d.set_pixel(x, y, c)
	d.generate_mipmaps()
	return ImageTexture.create_from_image(d)
