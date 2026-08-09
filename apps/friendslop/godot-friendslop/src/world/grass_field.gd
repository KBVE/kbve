extends Node3D

const DETAILED_MESH := preload("res://assets/biomes/grassland/HexaquoGrass/grass-stalk.obj")
const SIMPLE_MESH := preload("res://assets/biomes/grassland/HexaquoGrass/grass-stalk-simple.obj")

@export var player_path: NodePath
@export var grass_material: ShaderMaterial
@export var chunk_size := 5.0
@export var blades_per_sqm := 400.0
@export var lod_switch := 7.0
@export var grass_fade_out_start := 10.0
@export var grass_fade_out_end := 20.0
@export var world_half_extent := 256.0
@export var max_spawns_per_frame := 1

var _chunks: Dictionary = {}
var _last_center := Vector2i(2147483647, 2147483647)

@onready var _player: Node3D = get_node(player_path)


func _process(_delta: float) -> void:
	var p := _player.global_position
	if grass_material:
		grass_material.set_shader_parameter("object_position", p)

	var view_chunks := ceili(grass_fade_out_end / chunk_size) + 1
	var center := Vector2i(floori(p.x / chunk_size), floori(p.z / chunk_size))
	var needed: Dictionary = {}
	var missing: Array[Vector2i] = []
	for dx in range(-view_chunks, view_chunks + 1):
		for dz in range(-view_chunks, view_chunks + 1):
			var coord := center + Vector2i(dx, dz)
			if not _in_bounds(coord):
				continue
			if _chunk_center(coord).distance_to(Vector2(p.x, p.z)) > grass_fade_out_end + chunk_size:
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

	for coord: Vector2i in _chunks.keys():
		_update_chunk_lod(coord, p)

	if center != _last_center:
		_last_center = center
		Game.events.notify(EventNames.PLAYER_MOVED_CHUNK, center)


func _chunk_center(coord: Vector2i) -> Vector2:
	return Vector2((float(coord.x) + 0.5) * chunk_size, (float(coord.y) + 0.5) * chunk_size)


func _in_bounds(coord: Vector2i) -> bool:
	var min_x := coord.x * chunk_size
	var min_z := coord.y * chunk_size
	return min_x >= -world_half_extent and min_x + chunk_size <= world_half_extent \
		and min_z >= -world_half_extent and min_z + chunk_size <= world_half_extent


func _update_chunk_lod(coord: Vector2i, player_pos: Vector3) -> void:
	var inst: MultiMeshInstance3D = _chunks[coord]
	var dist := _chunk_center(coord).distance_to(Vector2(player_pos.x, player_pos.z))
	var target_mesh := DETAILED_MESH if dist < lod_switch else SIMPLE_MESH
	if inst.multimesh.mesh != target_mesh:
		inst.multimesh.mesh = target_mesh
	var alpha := 1.0 - smoothstep(grass_fade_out_start, grass_fade_out_end, dist)
	inst.visible = alpha > 0.0
	if inst.visible:
		inst.set_instance_shader_parameter("alpha", alpha)


func _spawn_chunk(coord: Vector2i) -> MultiMeshInstance3D:
	var count := int(chunk_size * chunk_size * blades_per_sqm)
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(coord)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = SIMPLE_MESH
	mm.instance_count = count
	var origin := Vector3(coord.x * chunk_size, 0.0, coord.y * chunk_size)
	for i in count:
		var pos := origin + Vector3(rng.randf() * chunk_size, 0.0, rng.randf() * chunk_size)
		var basis := Basis(Vector3.UP, rng.randf() * TAU)
		mm.set_instance_transform(i, Transform3D(basis, pos))
	var inst := MultiMeshInstance3D.new()
	inst.multimesh = mm
	inst.material_override = grass_material
	inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(inst)
	return inst
