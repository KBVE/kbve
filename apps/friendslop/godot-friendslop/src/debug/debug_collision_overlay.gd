extends Node3D


const HULL_COLOR := Color(0.25, 1.0, 0.45, 0.85)
const DISC_COLOR := Color(1.0, 0.75, 0.2, 0.7)
const DISC_SEGMENTS := 20
const REFRESH := 0.4

@export var stone_field_path: NodePath
@export var tree_field_path: NodePath

var _hulls: Node3D
var _discs: MeshInstance3D
var _shapes: Dictionary = {}
var _t := 0.0
var _shown := false


func _ready() -> void:
	_hulls = Node3D.new()
	add_child(_hulls)
	_discs = MeshInstance3D.new()
	_discs.mesh = ImmediateMesh.new()
	_discs.material_override = _line_material()
	_discs.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_discs)
	set_shown(false)


func set_shown(on: bool) -> void:
	_shown = on
	visible = on
	set_process(on)
	if on:
		_t = 0.0
		_rebuild()
	else:
		_clear()


func is_shown() -> bool:
	return _shown


func _process(delta: float) -> void:
	_t -= delta
	if _t > 0.0:
		return
	_t = REFRESH
	_rebuild()


func _clear() -> void:
	for child in _hulls.get_children():
		child.queue_free()
	(_discs.mesh as ImmediateMesh).clear_surfaces()


func _rebuild() -> void:
	_clear()
	var stones := _field(stone_field_path, "StoneField")
	if stones and stones.has_method("debug_colliders"):
		_draw_hulls(stones)
	_draw_discs([_field(stone_field_path, "StoneField"),
			_field(tree_field_path, "TreeField")])


func _field(path: NodePath, fallback: String) -> Node:
	if not path.is_empty():
		var node := get_node_or_null(path)
		if node:
			return node
	var scene := get_tree().current_scene
	return scene.get_node_or_null(NodePath(fallback)) if scene else null


func _hull_mesh(field: Node, variant: int, stage: int) -> Mesh:
	var key := variant * 16 + stage
	if _shapes.has(key):
		return _shapes[key]
	var points: PackedVector3Array = field.debug_hull_points(variant, stage)
	if points.is_empty():
		_shapes[key] = null
		return null
	var shape := ConvexPolygonShape3D.new()
	shape.points = points
	var mesh := shape.get_debug_mesh()
	_shapes[key] = mesh
	return mesh


func _draw_hulls(field: Node) -> void:
	var material := _line_material(HULL_COLOR)
	for entry in field.debug_colliders():
		var mesh := _hull_mesh(field, int(entry.get("variant", 0)), int(entry.get("stage", 0)))
		if mesh == null:
			continue
		var view := MeshInstance3D.new()
		view.mesh = mesh
		view.material_override = material
		view.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_hulls.add_child(view)
		view.global_transform = entry.get("transform", Transform3D.IDENTITY)


func _draw_discs(fields: Array) -> void:
	var mesh := _discs.mesh as ImmediateMesh
	mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	var drawn := false
	for field in fields:
		if field == null or not field.has_method("obstacle_discs"):
			continue
		var discs: PackedFloat32Array = field.obstacle_discs()
		var i := 0
		while i + 2 < discs.size():
			_ring(mesh, Vector3(discs[i], 0.0, discs[i + 1]), discs[i + 2])
			drawn = true
			i += 3
	mesh.surface_end()
	if not drawn:
		mesh.clear_surfaces()


func _ring(mesh: ImmediateMesh, center: Vector3, radius: float) -> void:
	var prev := center + Vector3(radius, 0.0, 0.0)
	for step in range(1, DISC_SEGMENTS + 1):
		var a := TAU * float(step) / float(DISC_SEGMENTS)
		var next := center + Vector3(cos(a) * radius, 0.0, sin(a) * radius)
		mesh.surface_set_color(DISC_COLOR)
		mesh.surface_add_vertex(prev)
		mesh.surface_set_color(DISC_COLOR)
		mesh.surface_add_vertex(next)
		prev = next


func _line_material(color: Color = DISC_COLOR) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.vertex_color_use_as_albedo = true
	m.albedo_color = color
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.no_depth_test = true
	return m
