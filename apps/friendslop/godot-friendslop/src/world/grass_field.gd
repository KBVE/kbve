@tool
extends Node3D

const DETAILED_MESH := preload("res://assets/biomes/grassland/grass/grass-stalk.obj")
const SIMPLE_MESH := preload("res://assets/biomes/grassland/grass/grass-stalk-simple.obj")
const CLUMP_MESH := preload("res://assets/biomes/grassland/grass/grass-clump.obj")

const LOD_UPDATE_DISTANCE_SQ := 0.25
const TIER_NEAR := 0
const TIER_MID := 1

@export var player_path: NodePath
@export var grass_material: ShaderMaterial
@export var chunk_size := 5.0
@export var blades_per_sqm := 400.0
@export var lod_near_enter := 6.5
@export var lod_near_exit := 8.0
@export var grass_fade_out_start := 16.0
@export var fade_tail := 14.0
@export var grass_fade_out_end := 100.0
@export var ring_fractions: Array[float] = [0.45, 0.25, 0.12, 0.06, 0.025]
@export var clump_fraction_threshold := 0.0
@export var ring_hysteresis := 1.0
@export var world_half_extent := 256.0
@export var max_chunks_spawned_per_frame := 8
@export var layout_seed := 1337
@export var layout_variants := 4

var _chunks: Dictionary = {}
var _tiers: Dictionary = {}
var _pending: Array[Vector2i] = []
var _last_center := Vector2i(2147483647, 2147483647)
var _last_lod_position := Vector3(INF, INF, INF)
var _mm: Array = []
var _boundaries: Array[float] = []
var _last_tier: int

@onready var _player: Node3D = get_node_or_null(player_path)


func _ready() -> void:
	var count := int(chunk_size * chunk_size * blades_per_sqm)
	var aabb := AABB(Vector3(-0.5, -8.0, -0.5), Vector3(chunk_size + 1.0, 16.0, chunk_size + 1.0))
	_boundaries.clear()
	var half_diagonal := chunk_size * 0.7071
	for f in ring_fractions:
		_boundaries.append(grass_fade_out_start + fade_tail * -log(f * 0.95) + half_diagonal)
	_last_tier = TIER_MID + ring_fractions.size()
	for v in layout_variants:
		var buf := _build_layout_buffer(layout_seed + v, count)
		var tiers: Array = [
			_make_multimesh(DETAILED_MESH, buf, count, aabb),
			_make_multimesh(SIMPLE_MESH, buf, count, aabb),
		]
		for f in ring_fractions:
			var mesh := SIMPLE_MESH if f > clump_fraction_threshold else CLUMP_MESH
			tiers.append(_make_multimesh(mesh, buf, int(count * f), aabb))
		_mm.append(tiers)
	if grass_material:
		grass_material.set_shader_parameter("fade_start", grass_fade_out_start)
		grass_material.set_shader_parameter("fade_tail", fade_tail)
		grass_material.set_shader_parameter("fade_end", grass_fade_out_end)
		grass_material.set_shader_parameter("total_blades", float(count))


func _process(_delta: float) -> void:
	var v := _view_origin()
	if grass_material:
		grass_material.set_shader_parameter("fade_origin", Vector3(v.x, 0.0, v.z))
		if _player:
			var p := _player.global_position
			grass_material.set_shader_parameter("object_position", Vector3(p.x, 0.0, p.z))

	var center := Vector2i(floori(v.x / chunk_size), floori(v.z / chunk_size))
	if center != _last_center:
		_last_center = center
		_refresh_chunks(center, v)
		_notify(EventNames.PLAYER_MOVED_CHUNK, center)

	var spawned := _drain_pending()
	if spawned or v.distance_squared_to(_last_lod_position) >= LOD_UPDATE_DISTANCE_SQ:
		_last_lod_position = v
		_update_lods(v)


func _view_origin() -> Vector3:
	if Engine.is_editor_hint():
		var cam: Camera3D = Engine.get_singleton("EditorInterface").get_editor_viewport_3d().get_camera_3d()
		return cam.global_position if cam else Vector3.ZERO
	var cam := get_viewport().get_camera_3d()
	if cam:
		return cam.global_position
	return _player.global_position if _player else Vector3.ZERO


func _notify(event: String, payload: Variant) -> void:
	if not Engine.is_editor_hint():
		Game.events.notify(event, payload)


func _refresh_chunks(center: Vector2i, p: Vector3) -> void:
	var margin := grass_fade_out_end + chunk_size * 1.5
	var view_chunks := ceili(margin / chunk_size)
	var player_xz := Vector2(p.x, p.z)
	var needed: Dictionary = {}
	for dx in range(-view_chunks, view_chunks + 1):
		for dz in range(-view_chunks, view_chunks + 1):
			var coord := center + Vector2i(dx, dz)
			if not _in_bounds(coord):
				continue
			if _chunk_center(coord).distance_to(player_xz) > margin:
				continue
			needed[coord] = true
			if not _chunks.has(coord) and not _pending.has(coord):
				_pending.append(coord)

	var to_remove: Array[Vector2i] = []
	for coord: Vector2i in _chunks:
		if not needed.has(coord):
			to_remove.append(coord)
	for coord in to_remove:
		_chunks[coord].queue_free()
		_chunks.erase(coord)
		_tiers.erase(coord)
		_notify(EventNames.CHUNK_FREED, coord)

	_pending = _pending.filter(func(c: Vector2i) -> bool: return needed.has(c))
	_pending.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return Vector2(a - center).length_squared() < Vector2(b - center).length_squared())


func _drain_pending() -> bool:
	var budget := mini(_pending.size(), max_chunks_spawned_per_frame)
	for i in budget:
		var coord: Vector2i = _pending.pop_front()
		_chunks[coord] = _spawn_chunk(coord)
		_notify(EventNames.CHUNK_SPAWNED, coord)
	return budget > 0


func _update_lods(p: Vector3) -> void:
	var player_xz := Vector2(p.x, p.z)
	for coord: Vector2i in _chunks:
		var dist := _chunk_center(coord).distance_to(player_xz)
		var current: int = _tiers[coord]
		var tier := _pick_tier(dist, current)
		if tier != current:
			_tiers[coord] = tier
			var inst: MultiMeshInstance3D = _chunks[coord]
			inst.multimesh = _mm[_layout_index(coord)][tier]


func _pick_tier(dist: float, current: int) -> int:
	if current == TIER_NEAR:
		if dist <= lod_near_exit:
			return TIER_NEAR
		current = TIER_MID
	elif dist < lod_near_enter:
		return TIER_NEAR

	if current < _last_tier and dist > _boundaries[current - 1] + ring_hysteresis:
		return current + 1
	if current > TIER_MID and dist < _boundaries[current - 2] - ring_hysteresis:
		return current - 1
	return current


func _raw_tier(dist: float) -> int:
	if dist < lod_near_enter:
		return TIER_NEAR
	var t := TIER_MID
	for i in _boundaries.size():
		if dist > _boundaries[i]:
			t = TIER_MID + 1 + i
	return t


func _layout_index(coord: Vector2i) -> int:
	return posmod(coord.x * 73856093 ^ coord.y * 19349663, layout_variants)


func _build_layout_buffer(seed_value: int, count: int) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var buf := PackedFloat32Array()
	buf.resize(count * 12)
	for i in count:
		var o := i * 12
		var yaw := rng.randf() * TAU
		var tilt_dir := rng.randf() * TAU
		var tilt := rng.randf_range(0.0, 0.25)
		var s := rng.randf_range(0.75, 1.3)
		var axis := Vector3(cos(tilt_dir), 0.0, sin(tilt_dir))
		var basis := Basis(axis, tilt) * Basis(Vector3.UP, yaw)
		basis = basis.scaled(Vector3(s, s, s))
		buf[o] = basis.x.x
		buf[o + 1] = basis.y.x
		buf[o + 2] = basis.z.x
		buf[o + 3] = rng.randf() * chunk_size
		buf[o + 4] = basis.x.y
		buf[o + 5] = basis.y.y
		buf[o + 6] = basis.z.y
		buf[o + 8] = basis.x.z
		buf[o + 9] = basis.y.z
		buf[o + 10] = basis.z.z
		buf[o + 11] = rng.randf() * chunk_size
	return buf


func _make_multimesh(mesh: Mesh, buf: PackedFloat32Array, count: int, aabb: AABB) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = count
	mm.buffer = buf.slice(0, count * 12)
	mm.custom_aabb = aabb
	return mm


func _chunk_center(coord: Vector2i) -> Vector2:
	return Vector2((float(coord.x) + 0.5) * chunk_size, (float(coord.y) + 0.5) * chunk_size)


func _in_bounds(coord: Vector2i) -> bool:
	var min_x := coord.x * chunk_size
	var min_z := coord.y * chunk_size
	return min_x >= -world_half_extent and min_x + chunk_size <= world_half_extent \
		and min_z >= -world_half_extent and min_z + chunk_size <= world_half_extent


func _spawn_chunk(coord: Vector2i) -> MultiMeshInstance3D:
	var v := _view_origin()
	var tier := _raw_tier(_chunk_center(coord).distance_to(Vector2(v.x, v.z)))
	var inst := MultiMeshInstance3D.new()
	inst.multimesh = _mm[_layout_index(coord)][tier]
	inst.material_override = grass_material
	inst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	inst.position = Vector3(coord.x * chunk_size, 0.0, coord.y * chunk_size)
	_tiers[coord] = tier
	add_child(inst)
	return inst
