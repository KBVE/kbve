extends SkeletonModifier3D


const ChainIK := preload("res://src/characters/hinge_chain_ik.gd")

const SIDES := ["L", "R"]
const CHAIN := ["UpperLeg", "MidLeg", "LowerLeg"]

@export var terrain_path: NodePath
@export var root_bone := &"Body"
@export_flags_3d_physics var probe_mask := 1
@export var probe_up_ratio := 0.35
@export var probe_down_ratio := 0.8
@export var plant_height_ratio := 0.22
@export var max_root_drop_ratio := 0.25
@export var max_ground_step_ratio := 0.7
@export var max_foot_tilt_deg := 35.0
@export var adapt_speed := 10.0
@export var solver_iterations := 3
@export_range(0.7, 1.0) var knee_comfort := 0.94

var legs: Array[Dictionary] = []

var _terrain: Node
var _root := -1
var _root_offset := 0.0
var _blend := 1.0
var _want := 1.0
var _built := false
var _reach := 0.0
var _exclude: Array[RID] = []

var _probe: Array[Vector3] = []
var _post: Array[Vector3] = []
var _hit: Array[bool] = []
var _hit_y: Array[float] = []
var _hit_normal: Array[Vector3] = []


func setup(terrain: Node, exclude: PhysicsBody3D = null) -> void:
	_terrain = terrain
	if exclude:
		_exclude = [exclude.get_rid()]


func set_ground_weight(value: float) -> void:
	_want = clampf(value, 0.0, 1.0)


func _build() -> void:
	_built = true
	var skeleton := get_skeleton()
	if skeleton == null:
		return
	if _terrain == null and not terrain_path.is_empty():
		_terrain = get_node_or_null(terrain_path)
	_root = skeleton.find_bone(root_bone)

	for side in SIDES:
		var chain := PackedInt32Array()
		for part in CHAIN:
			var bone := skeleton.find_bone("%s.%s" % [part, side])
			if bone >= 0:
				chain.append(bone)
		var foot := skeleton.find_bone("Foot.%s" % side)
		if chain.size() < 2 or foot < 0:
			push_warning("creature_foot_ik: no leg chain for side %s" % side)
			continue
		var ankle := skeleton.get_bone_global_rest(foot).origin
		var last := chain[chain.size() - 1]
		var tip_local := skeleton.get_bone_global_rest(last).affine_inverse() * ankle
		var reach := ChainIK.rest_limits(skeleton, chain, tip_local).y
		legs.append({
			&"chain": chain,
			&"foot": foot,
			&"tip": tip_local,
			&"reach": reach,
			&"ankle_height": ankle.y,
		})
		_reach = maxf(_reach, reach)

	_probe.resize(legs.size())
	_post.resize(legs.size())
	_hit.resize(legs.size())
	_hit_y.resize(legs.size())
	_hit_normal.resize(legs.size())
	_hit_normal.fill(Vector3.UP)


func _physics_process(_delta: float) -> void:
	if legs.is_empty():
		return
	var space := get_world_3d().direct_space_state
	for i in legs.size():
		var at := _probe[i]
		var query := PhysicsRayQueryParameters3D.create(
				at + Vector3.UP * (_reach * probe_up_ratio),
				at - Vector3.UP * (_reach * probe_down_ratio), probe_mask, _exclude)
		var result := space.intersect_ray(query)
		_hit[i] = not result.is_empty()
		if _hit[i]:
			_hit_y[i] = (result.position as Vector3).y
			_hit_normal[i] = result.normal


func _process_modification_with_delta(delta: float) -> void:
	if not _built:
		_build()
	var skeleton := get_skeleton()
	if skeleton == null or _terrain == null or legs.is_empty():
		return

	var weight := clampf(adapt_speed * delta, 0.0, 1.0)
	_blend = lerpf(_blend, _want, weight)
	if _blend <= 0.001:
		_root_offset = lerpf(_root_offset, 0.0, weight)
		_apply_root(skeleton)
		return

	var to_world := skeleton.global_transform
	var base_y := to_world.origin.y
	var plant_height := _reach * plant_height_ratio
	var max_step := _reach * max_ground_step_ratio

	var ankles: Array[Vector3] = []
	var grounds: Array[float] = []
	var normals: Array[Vector3] = []
	var plant: Array[float] = []

	for i in legs.size():
		var leg := legs[i]
		var ankle := ChainIK.tip(skeleton, leg[&"chain"], leg[&"tip"], to_world)
		_probe[i] = ankle
		var terrain_h: float = _terrain.height_at(ankle.x, ankle.z)
		var surface := terrain_h
		var normal := _terrain_normal(ankle)
		if _hit[i] and _hit_y[i] > terrain_h + 0.05:
			surface = _hit_y[i]
			normal = _hit_normal[i]

		var reachable := 1.0 - smoothstep(max_step, max_step * 1.6,
				absf(surface - base_y))
		var lift: float = ankle.y - base_y - leg[&"ankle_height"]
		ankles.append(ankle)
		grounds.append(surface + leg[&"ankle_height"])
		normals.append(normal.lerp(Vector3.UP, 1.0 - reachable).normalized())
		plant.append(reachable * (1.0 - smoothstep(0.0, plant_height, lift)))

	_root_offset = lerpf(_root_offset,
			_solve_root(skeleton, to_world, ankles, grounds, plant) * _blend, weight)
	_apply_root(skeleton)

	for i in legs.size():
		var leg := legs[i]
		var amount := plant[i] * _blend
		if amount > 0.001:
			var ankle := ChainIK.tip(skeleton, leg[&"chain"], leg[&"tip"], to_world)
			var goal := ankle.lerp(Vector3(ankle.x, grounds[i], ankle.z), plant[i])
			ChainIK.solve(skeleton, leg[&"chain"], leg[&"tip"], goal, amount)
			_place_foot(skeleton, leg, to_world, normals[i], amount)
		_post[i] = ChainIK.tip(skeleton, leg[&"chain"], leg[&"tip"], to_world)

	_debug(delta, plant, grounds)


func _place_foot(skeleton: Skeleton3D, leg: Dictionary, to_world: Transform3D,
		normal: Vector3, amount: float) -> void:
	var foot: int = leg[&"foot"]
	var pose := skeleton.get_bone_global_pose(foot)
	var ankle := ChainIK.tip(skeleton, leg[&"chain"], leg[&"tip"], to_world)
	var posed := to_world.basis * pose.basis
	skeleton.set_bone_global_pose(foot, Transform3D(
			to_world.basis.inverse() * _tilt(normal, posed, amount),
			to_world.affine_inverse() * ankle))


func _solve_root(skeleton: Skeleton3D, to_world: Transform3D, ankles: Array[Vector3],
		grounds: Array[float], plant: Array[float]) -> float:
	if _root < 0:
		return 0.0
	var socket: Array[Vector3] = []
	var target: Array[Vector3] = []
	var reach: Array[float] = []
	var active: Array[int] = []
	for i in legs.size():
		var leg := legs[i]
		socket.append(to_world * skeleton.get_bone_global_pose(leg[&"chain"][0]).origin)
		target.append(Vector3(ankles[i].x, grounds[i], ankles[i].z))
		reach.append(leg[&"reach"])
		if plant[i] > 0.5:
			active.append(i)

	var limit := _reach * max_root_drop_ratio
	var needed := _drop_for(socket, target, reach, active, 0.99, limit)
	var eased := _drop_for(socket, target, reach, active, knee_comfort, limit)
	return maxf(eased, needed - limit * 0.2)


func _drop_for(socket: Array[Vector3], target: Array[Vector3], reach: Array[float],
		active: Array[int], ratio: float, limit: float) -> float:
	var drop := 0.0
	for step in solver_iterations:
		var worst := 0.0
		for i in active:
			var moved := socket[i] + Vector3(0.0, drop, 0.0)
			worst = maxf(worst, moved.distance_to(target[i]) - reach[i] * ratio)
		if worst <= 0.0:
			break
		drop = maxf(drop - worst, -limit)
	return drop


func _apply_root(skeleton: Skeleton3D) -> void:
	if _root < 0:
		return
	var parent := skeleton.get_bone_parent(_root)
	var parent_basis := skeleton.global_transform.basis
	if parent >= 0:
		parent_basis = parent_basis * skeleton.get_bone_global_pose(parent).basis
	skeleton.set_bone_pose_position(_root, skeleton.get_bone_pose_position(_root)
			+ parent_basis.inverse() * Vector3(0.0, _root_offset, 0.0))


func _terrain_normal(at: Vector3) -> Vector3:
	var e := _reach * 0.06
	var hx: float = _terrain.height_at(at.x + e, at.z) - _terrain.height_at(at.x - e, at.z)
	var hz: float = _terrain.height_at(at.x, at.z + e) - _terrain.height_at(at.x, at.z - e)
	return Vector3(-hx, 2.0 * e, -hz).normalized()


func _tilt(normal: Vector3, posed: Basis, amount: float) -> Basis:
	var angle := normal.angle_to(Vector3.UP)
	if angle < 0.0001 or amount <= 0.001:
		return posed
	var limit := deg_to_rad(max_foot_tilt_deg)
	var n := normal
	if angle > limit:
		n = Vector3.UP.slerp(normal, limit / angle).normalized()
	return Basis(Quaternion.IDENTITY.slerp(Quaternion(Vector3.UP, n), amount)) * posed


var _debug_t := 0.0


func _debug(delta: float, plant: Array[float], grounds: Array[float]) -> void:
	if OS.get_environment("Q_FOOT_DEBUG") == "":
		return
	_debug_t += delta
	if _debug_t < 0.5:
		return
	_debug_t = 0.0
	var out := "reach=%.2f root=%+.3f blend=%.2f" % [_reach, _root_offset, _blend]
	for i in legs.size():
		out += " | %s plant=%.2f err=%+.3f" % [SIDES[i], plant[i],
				_post[i].y - grounds[i]]
	print("[creature ik] ", out)
