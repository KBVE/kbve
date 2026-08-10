@tool
extends EditorScenePostImport


func _post_import(scene: Node) -> Object:
	_walk(scene)
	return scene


func _walk(node: Node) -> void:
	var mi := node as MeshInstance3D
	if mi and mi.mesh:
		for i in mi.mesh.get_surface_count():
			var src := mi.mesh.surface_get_material(i) as BaseMaterial3D
			if src:
				var m := ShaderMaterial.new()
				m.resource_name = src.resource_name
				m.shader = load("res://assets/fx/shaders/toon.gdshader")
				if src.albedo_texture:
					m.set_shader_parameter("albedo_tex", src.albedo_texture)
				else:
					m.set_shader_parameter("albedo_tex", load("res://assets/environment/props/fauna/raven/raven_Raven_Mat.png"))
				mi.mesh.surface_set_material(i, m)
	for child in node.get_children():
		_walk(child)
