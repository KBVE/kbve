extends Node3D

@export var player_path: NodePath
@export var grass_material: Material
@export var chunk_size := 16.0
@export var view_radius := 2
@export var blades_per_sqm := 20.0
@export var world_half_extent := 256.0
@export var max_spawns_per_frame := 2

var _chunks: Dictionary = {}
var _blade_mesh: QuadMesh
var _last_center := Vector2i(2147483647, 2147483647)

@onready var _player: Node3D = get_node(player_path)


func _ready() -> void:
	_blade_mesh = QuadMesh.new()
	_blade_mesh.size = Vector2(0.4, 0.4)
	_blade_mesh.subdivide_width = 2
	_blade_mesh.subdivide_depth = 2
	_blade_mesh.center_offset = Vector3(0, 0.2, 0)


func _process(_delta: float) -> void:
	var p := _player.global_position
	var center := Vector2i(floori(p.x / chunk_size), floori(p.z / chunk_size))
	var needed: Dictionary = {}
	var missing: Array[Vector2i] = []
	for dx in range(-view_radius, view_radius + 1):
		for dz in range(-view_radius, view_radius + 1):
			var coord := center + Vector2i(dx, dz)
			if not _in_bounds(coord):
				continue
			needed[coord] = true
			if not _chunks.has(coord):
				missing.append(coord)
	missing.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return Vector2(a - center).length_squared() < Vector2(b - center).length_squared())
	for i in mini(missing.size(), max_spawns_per_frame):
		_chunks[missing[i]] = _spawn_chunk(missing[i])
		Game.events.notify(EventNames.CHUNK_SPAWNED, missing[i])
	for coord: Vector2i in _chunks.keys():
		if not needed.has(coord):
			_chunks[coord].queue_free()
			_chunks.erase(coord)
			Game.events.notify(EventNames.CHUNK_FREED, coord)
	if center != _last_center:
		_last_center = center
		Game.events.notify(EventNames.PLAYER_MOVED_CHUNK, center)


func _in_bounds(coord: Vector2i) -> bool:
	var min_x := coord.x * chunk_size
	var min_z := coord.y * chunk_size
	return min_x >= -world_half_extent and min_x + chunk_size <= world_half_extent \
		and min_z >= -world_half_extent and min_z + chunk_size <= world_half_extent


func _spawn_chunk(coord: Vector2i) -> MultiMeshInstance3D:
	var count := int(chunk_size * chunk_size * blades_per_sqm)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(coord)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = _blade_mesh
	mm.instance_count = count
	var origin := Vector3(coord.x * chunk_size, 0.0, coord.y * chunk_size)
	for i in count:
		var pos := origin + Vector3(rng.randf() * chunk_size, 0.0, rng.randf() * chunk_size)
		var basis := Basis(Vector3.UP, rng.randf() * TAU)
		var s := rng.randf_range(0.8, 1.2)
		basis = basis.scaled(Vector3(s, s, s))
		mm.set_instance_transform(i, Transform3D(basis, pos))
	var inst := MultiMeshInstance3D.new()
	inst.multimesh = mm
	inst.material_override = grass_material
	inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(inst)
	return inst
