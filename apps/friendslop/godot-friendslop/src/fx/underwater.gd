extends Node3D

@export var terrain_path: NodePath = ^"../Terrain"
@export var material: ShaderMaterial
@export var blend_band := 0.3

var _terrain: Node = null
var _have_water := false
var _water := 0.0
var _quad: MeshInstance3D = null
var _submersion := -1.0

func _ready() -> void:
	if material == null:
		set_process(false)
		return
	var mesh := QuadMesh.new()
	mesh.size = Vector2.ONE
	_quad = MeshInstance3D.new()
	_quad.mesh = mesh
	_quad.material_override = material
	_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_quad.custom_aabb = AABB(Vector3(-100000.0, -100000.0, -100000.0), Vector3(200000.0, 200000.0, 200000.0))
	_quad.visible = false
	add_child(_quad)
	_apply(0.0)

func _process(_delta: float) -> void:
	if not _have_water:
		if _terrain == null or not is_instance_valid(_terrain):
			_terrain = get_node_or_null(terrain_path)
		if _terrain == null or not _terrain.has_method("water_level_at"):
			return
		_water = _terrain.water_level_at()
		_have_water = true

	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return
	_apply(clampf((_water - cam.global_position.y) / maxf(blend_band, 0.001), 0.0, 1.0))

func _apply(submersion: float) -> void:
	if is_equal_approx(submersion, _submersion):
		return
	_submersion = submersion
	material.set_shader_parameter("submersion", submersion)
	_quad.visible = submersion > 0.0
