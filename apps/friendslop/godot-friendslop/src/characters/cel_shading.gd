extends RefCounted

## Puts the cel shader over an imported mesh's surfaces, keyed by material name.
##
## Shared by every rig rather than written per creature, because the awkward parts
## are the same wherever it is used: the imported material is shared by every
## instance of the glb so it has to be overridden rather than edited, and the
## kit's tint has to be fed back in as a shader parameter because the glTF
## importer drops it.
##
## Config per material name:
##   tint  - name of a Color property on `owner` the base map is multiplied by
##   body  - use the shader's body preset instead of its cloth one
##   lit   - flatten the terminator, for surfaces a shadow edge must not cross
##   sat   - scale the map's chroma, for maps more saturated than the scene

const SHADER := preload("res://assets/fx/shaders/anime.gdshader")


static func apply(mi: MeshInstance3D, shading: Dictionary, owner: Object) -> void:
	if mi.mesh == null:
		return
	for i in mi.mesh.get_surface_count():
		var src := mi.mesh.surface_get_material(i) as BaseMaterial3D
		if src == null:
			continue
		var cfg: Dictionary = shading.get(src.resource_name, {})
		if cfg.is_empty():
			push_warning("cel_shading: no entry for material %s" % src.resource_name)
			continue
		mi.set_surface_override_material(i, build(src, cfg, owner))


static func build(src: BaseMaterial3D, cfg: Dictionary, owner: Object) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.resource_name = src.resource_name
	mat.shader = SHADER
	if src.albedo_texture:
		mat.set_shader_parameter(&"albedo_tex", src.albedo_texture)
	var tint: StringName = cfg.get(&"tint", &"")
	var color: Color = owner.get(tint) if tint != &"" else Color.WHITE
	mat.set_shader_parameter(&"albedo_tint", Vector3(color.r, color.g, color.b))
	mat.set_shader_parameter(&"albedo_sat", cfg.get(&"sat", 1.0))
	mat.set_shader_parameter(&"body_shadows", cfg.get(&"body", false))
	if cfg.get(&"lit", false):
		mat.set_shader_parameter(&"shadow_threshold", 0.0)
	return mat
