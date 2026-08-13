extends SkeletonModifier3D

const TwoBoneIK := preload("res://src/characters/two_bone_ik.gd")

## Plants feet on the terrain instead of on the flat plane the clips assume.

const FEET := [
	{"foot": &"LeftFoot", "upper": &"LeftUpperLeg", "lower": &"LeftLowerLeg"},
	{"foot": &"RightFoot", "upper": &"RightUpperLeg", "lower": &"RightLowerLeg"},
]

@export var terrain_path: NodePath
## Rays start this far above the foot and reach this far below it.
@export var probe_up := 0.6
@export var probe_down := 1.2
@export_flags_3d_physics var probe_mask := 1
## Ankle bone height in the rest pose, measured against the body mesh's lowest vertex.
@export var ankle_height := 0.0865
## How far the hips may drop to keep the trailing foot from over-extending.
@export var max_hip_drop := 0.45
## Newton steps used to drive the reach violation to zero.
@export var solver_iterations := 3
## Extension the hips are solved to keep the most-stretched planted leg under.
@export_range(0.7, 1.0) var knee_comfort := 0.94
## Budget for the comfort part of the drop, on top of whatever reachability demands.
@export var max_comfort_drop := 0.09
## Clip lift at which a foot counts as fully mid-stride and is left to the animation.
@export var plant_height := 0.32
## Ground normals steeper than this stop steering the foot, so a cliff edge under one
## toe does not snap the whole foot sideways.
@export var max_foot_tilt_deg := 35.0
## How far a foot's ground may sit from the ground the body is standing on.
@export var max_ground_step := 1.2
@export var adapt_speed := 10.0

## Added to ankle_height by footwear, whose sole sits below the bare foot.
var sole_offset := 0.0

var targets: Array[Marker3D] = []

var _terrain: Node
var _hips := -1
var _hip_offset := 0.0
## Fades the whole solve out where there is no ground to stand on.
var _blend := 1.0
var _ready_done := false
## How much of the legs the animation state is handing over, set by the rig from the
## live crossfade.
var _want := 1.0

## Ray results, refreshed on the physics tick.
var _probe_xz: Array[Vector2] = [Vector2.ZERO, Vector2.ZERO]
var _probe_y: Array[float] = [0.0, 0.0]
var _hit: Array[bool] = [false, false]
var _hit_y: Array[float] = [0.0, 0.0]
var _hit_normal: Array[Vector3] = [Vector3.UP, Vector3.UP]
var _post_y: Array[float] = [0.0, 0.0]
## Per-foot confidence that the sampled surface is the one the body stands on.
var _edge: Array[float] = [1.0, 1.0]
## Hinge the bend was solved about, in skeleton space, for the debug line.
var _pole_dbg: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _probe_dbg: Array[String] = ["", ""]
var _exclude: Array[RID] = []


func set_sole_offset(value: float) -> void:
	sole_offset = value


## Distance the foot mesh extends below the ankle bone.
func measure_sole(mesh: MeshInstance3D, foot_bone: StringName) -> void:
	var skeleton := get_skeleton()
	if skeleton == null or mesh == null:
		return
	var idx := skeleton.find_bone(foot_bone)
	if idx < 0:
		return
	var ankle := skeleton.get_bone_global_rest(idx).origin.y
	sole_offset = maxf(0.0, ankle - ankle_height - mesh.get_aabb().position.y)


func setup(terrain: Node, exclude: PhysicsBody3D = null) -> void:
	_terrain = terrain
	if exclude:
		_exclude = [exclude.get_rid()]


func _physics_process(_delta: float) -> void:
	var space := get_world_3d().direct_space_state
	for i in FEET.size():
		var from := Vector3(_probe_xz[i].x, _probe_y[i] + probe_up, _probe_xz[i].y)
		var to := Vector3(_probe_xz[i].x, _probe_y[i] - probe_down, _probe_xz[i].y)
		var query := PhysicsRayQueryParameters3D.create(from, to, probe_mask, _exclude)
		var result := space.intersect_ray(query)
		_hit[i] = not result.is_empty()
		if _hit[i]:
			_hit_y[i] = (result.position as Vector3).y
			_hit_normal[i] = result.normal


func set_ground_weight(value: float) -> void:
	_want = clampf(value, 0.0, 1.0)


func _build() -> void:
	_ready_done = true
	var skeleton := get_skeleton()
	if skeleton == null:
		return
	if _terrain == null and not terrain_path.is_empty():
		_terrain = get_node_or_null(terrain_path)
	_hips = skeleton.find_bone(&"Hips")

	for i in FEET.size():
		var marker := Marker3D.new()
		marker.top_level = true
		skeleton.add_child(marker)
		targets.append(marker)

	if OS.get_environment("Q_FOOT_DEBUG") != "":
		var probe := Tail.new()
		probe.driver = self
		skeleton.add_child(probe)


## Reads the pose back from behind the solver.
class Tail extends SkeletonModifier3D:
	var driver

	func _process_modification() -> void:
		var skeleton := get_skeleton()
		if skeleton == null or driver == null:
			return
		for i in driver.FEET.size():
			var idx: int = skeleton.find_bone(driver.FEET[i].foot)
			if idx >= 0:
				driver._post_y[i] = (skeleton.global_transform
						* skeleton.get_bone_global_pose(idx)).origin.y


func _process_modification_with_delta(delta: float) -> void:
	if not _ready_done:
		_build()
	var skeleton := get_skeleton()
	if skeleton == null or _terrain == null:
		return

	var weight := clampf(adapt_speed * delta, 0.0, 1.0)
	_blend = lerpf(_blend, _want, weight)
	if _blend <= 0.001:
		_hip_offset = lerpf(_hip_offset, 0.0, weight)
		_apply_hips(skeleton)
		return

	var base_y := skeleton.global_transform.origin.y
	var posed: Array[Transform3D] = []
	var grounds: Array[float] = []
	var normals: Array[Vector3] = []
	var plant: Array[float] = []

	for i in FEET.size():
		var idx := skeleton.find_bone(FEET[i].foot)
		if idx < 0:
			posed.append(Transform3D.IDENTITY)
			grounds.append(base_y)
			normals.append(Vector3.UP)
			plant.append(0.0)
			continue
		var pose := skeleton.global_transform * skeleton.get_bone_global_pose(idx)
		var world := pose.origin
		_probe_xz[i] = Vector2(world.x, world.z)
		_probe_y[i] = world.y

		var terrain_h: float = _terrain.height_at(world.x, world.z)
		var surface := terrain_h
		var normal := _terrain_normal(world)
		var from_ray := _hit[i] and _hit_y[i] > terrain_h + 0.05
		if from_ray:
			surface = _hit_y[i]
			normal = _hit_normal[i]
		if OS.get_environment("Q_FOOT_DEBUG") != "":
			_probe_dbg[i] = "terrain=%.3f ray=%s%.3f used=%s src=%s" % [terrain_h,
					"" if _hit[i] else "miss@", _hit_y[i], surface,
					"ray" if from_ray else "field"]

		var step := absf(surface - base_y)
		var reachable := 1.0 - smoothstep(max_ground_step, max_ground_step * 1.6, step)

		posed.append(pose)
		grounds.append(surface + ankle_height + sole_offset)
		normals.append(normal.lerp(Vector3.UP, 1.0 - reachable).normalized())
		_edge[i] = reachable
		plant.append(reachable * (1.0 - smoothstep(0.0, plant_height,
				world.y - base_y - ankle_height - sole_offset)))

	_hip_offset = lerpf(_hip_offset,
			_solve_hips(skeleton, posed, grounds, plant) * _blend, weight)
	_apply_hips(skeleton)

	for i in FEET.size():
		var idx := skeleton.find_bone(FEET[i].foot)
		if idx >= 0:
			posed[i] = skeleton.global_transform * skeleton.get_bone_global_pose(idx)

	_debug(skeleton, posed, grounds, plant, base_y, delta)

	for i in FEET.size():
		var world: Vector3 = posed[i].origin
		var planted := Vector3(world.x, grounds[i], world.z)
		var goal := _reachable(skeleton, i, world.lerp(planted, plant[i]))
		targets[i].global_position = goal
		if _blend > 0.001:
			_solve_leg(skeleton, i, goal, normals[i], plant[i] * _blend)


## Plants the leg, then lays the ground's tilt over the foot the animation and the solve
## left it in.
func _solve_leg(skeleton: Skeleton3D, i: int, goal: Vector3, normal: Vector3,
		amount: float) -> void:
	var hip := skeleton.find_bone(FEET[i].upper)
	var knee := skeleton.find_bone(FEET[i].lower)
	var ankle := skeleton.find_bone(FEET[i].foot)
	if not TwoBoneIK.solve(skeleton, hip, knee, ankle, goal, amount):
		return

	if OS.get_environment("Q_FOOT_DEBUG") != "":
		var to_world := skeleton.global_transform
		_pole_dbg[i] = to_world.basis.inverse() * TwoBoneIK.hinge_axis(
				skeleton, hip, knee, ankle, to_world).normalized()

	var ankle_pose := skeleton.get_bone_global_pose(ankle)
	var followed := skeleton.global_transform.basis * ankle_pose.basis
	skeleton.set_bone_global_pose(ankle, Transform3D(
			skeleton.global_transform.basis.inverse() * _tilt(normal, followed, amount),
			ankle_pose.origin))


## Clamps a target into the leg's span.
func _reachable(skeleton: Skeleton3D, i: int, target: Vector3) -> Vector3:
	var hip := skeleton.find_bone(FEET[i].upper)
	var knee := skeleton.find_bone(FEET[i].lower)
	var ankle := skeleton.find_bone(FEET[i].foot)
	if hip < 0 or knee < 0 or ankle < 0:
		return target
	var hip_w := (skeleton.global_transform * skeleton.get_bone_global_pose(hip)).origin
	var reach := skeleton.get_bone_global_rest(hip).origin.distance_to(
			skeleton.get_bone_global_rest(knee).origin) \
			+ skeleton.get_bone_global_rest(knee).origin.distance_to(
			skeleton.get_bone_global_rest(ankle).origin)
	var span := hip_w.distance_to(target)
	var limit := reach * 0.99
	if span <= limit or span < 0.0001:
		return target
	return hip_w + (target - hip_w) / span * limit


var _debug_t := 0.0


func _debug(skeleton: Skeleton3D, posed: Array[Transform3D], grounds: Array[float],
		plant: Array[float], base_y: float, delta: float) -> void:
	if OS.get_environment("Q_FOOT_DEBUG") == "":
		return
	_debug_t += delta
	if _debug_t < 0.5:
		return
	_debug_t = 0.0
	var out := "base_y=%.3f hip=%.3f blend=%.2f want=%.2f" % [base_y, _hip_offset, _blend, _want]
	for i in FEET.size():
		var hip := skeleton.find_bone(FEET[i].upper)
		var knee := skeleton.find_bone(FEET[i].lower)
		var ankle := skeleton.find_bone(FEET[i].foot)
		var hip_w := (skeleton.global_transform * skeleton.get_bone_global_pose(hip)).origin
		var reach := skeleton.get_bone_global_rest(hip).origin.distance_to(
				skeleton.get_bone_global_rest(knee).origin) \
				+ skeleton.get_bone_global_rest(knee).origin.distance_to(
				skeleton.get_bone_global_rest(ankle).origin)
		var target := Vector3(posed[i].origin.x, grounds[i], posed[i].origin.z)
		out += " | %s w=%.2f err=%+.3f hinge=(%.2f,%.2f,%.2f)" % [
				FEET[i].foot,
				plant[i], _post_y[i] - grounds[i],
				_pole_dbg[i].x, _pole_dbg[i].y, _pole_dbg[i].z]
		out += "\n    %s %s" % [FEET[i].foot, _probe_dbg[i]]
	print("[footik] ", out)


## Solves the pelvis drop that brings every planted foot inside its leg's reach.
func _solve_hips(skeleton: Skeleton3D, posed: Array[Transform3D], grounds: Array[float],
		plant: Array[float]) -> float:
	if _hips < 0:
		return 0.0
	var hips_pose := skeleton.get_bone_global_pose(_hips)
	var to_world := skeleton.global_transform

	var socket: Array[Vector3] = []
	var target: Array[Vector3] = []
	var reach: Array[float] = []
	var active: Array[int] = []
	for i in FEET.size():
		var upper := skeleton.find_bone(FEET[i].upper)
		socket.append(Vector3.ZERO if upper < 0 else
				to_world * skeleton.get_bone_global_pose(upper).origin)
		target.append(Vector3(posed[i].origin.x, grounds[i], posed[i].origin.z))
		reach.append(_leg_reach(skeleton, i))
		if upper >= 0 and plant[i] > 0.5:
			active.append(i)

	var needed := _drop_for(socket, target, reach, active, 0.99, max_hip_drop)
	var eased := _drop_for(socket, target, reach, active, knee_comfort, max_hip_drop)
	return maxf(eased, needed - max_comfort_drop)


## Newton-steps the pelvis down until no planted leg is stretched past `ratio` of its
## span.
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


func _leg_reach(skeleton: Skeleton3D, i: int) -> float:
	var hip := skeleton.find_bone(FEET[i].upper)
	var knee := skeleton.find_bone(FEET[i].lower)
	var ankle := skeleton.find_bone(FEET[i].foot)
	if hip < 0 or knee < 0 or ankle < 0:
		return 0.0
	return skeleton.get_bone_global_rest(hip).origin.distance_to(
			skeleton.get_bone_global_rest(knee).origin) \
			+ skeleton.get_bone_global_rest(knee).origin.distance_to(
			skeleton.get_bone_global_rest(ankle).origin)


func _apply_hips(skeleton: Skeleton3D) -> void:
	if _hips < 0:
		return
	var parent := skeleton.get_bone_parent(_hips)
	var parent_basis := skeleton.global_transform.basis
	if parent >= 0:
		parent_basis = parent_basis * skeleton.get_bone_global_pose(parent).basis
	skeleton.set_bone_pose_position(_hips, skeleton.get_bone_pose_position(_hips)
			+ parent_basis.inverse() * Vector3(0.0, _hip_offset, 0.0))


## Fallback normal by finite difference, for when the ray missed and only the height
## field has an answer.
func _terrain_normal(at: Vector3) -> Vector3:
	var e := 0.15
	var hx: float = _terrain.height_at(at.x + e, at.z) - _terrain.height_at(at.x - e, at.z)
	var hz: float = _terrain.height_at(at.x, at.z + e) - _terrain.height_at(at.x, at.z - e)
	return Vector3(-hx, 2.0 * e, -hz).normalized()


## The animated basis is tilted onto the ground normal rather than rebuilt from it.
func _tilt(normal: Vector3, posed: Basis, amount: float) -> Basis:
	var angle := normal.angle_to(Vector3.UP)
	if angle < 0.0001 or amount <= 0.001:
		return posed
	var limit := deg_to_rad(max_foot_tilt_deg)
	var n := normal
	if angle > limit:
		n = Vector3.UP.slerp(normal, limit / angle).normalized()
	return Basis(Quaternion.IDENTITY.slerp(Quaternion(Vector3.UP, n), amount)) * posed
