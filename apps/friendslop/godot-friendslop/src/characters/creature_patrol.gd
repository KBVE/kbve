extends CharacterBody3D


const CreatureRig := preload("res://src/characters/creature_rig.gd")

@export var rig: Node3D
@export var leader_path: NodePath
@export var seed := 0

@export var formation_slot := 0
@export var formation_count := 1

@export var preset := &"mech"

@export var turn_rate := 2.5
@export var action_interval := 7.0

@export var collider_radius := 0.0
@export var collider_height := 0.0
@export var collider_radius_scale := 0.4

const GROUP := &"creature_patrol"

const LAYER_WORLD := 1
const LAYER_CREATURE := 4

const ESCAPE_RINGS: Array[float] = [4.0, 8.0, 14.0, 22.0]
const ESCAPE_SAMPLES := 12
const REACH_FRAMES := 120
const MAX_ACCEL := 28.0

var motion_dot := 1.0

var _patrol: QPatrol
var _leader: Node3D
var _last_pos := Vector3.ZERO
var _travelled := 0.0
var _leader_last := Vector3.ZERO
var _action_t := 0.0
var _prepared := false
var _mode := 0
var _radius := 1.0
var _reach := 0.0
var _reach_frames := 0

var _sim: Node
var _sim_id := 0
var _capsule_half_height := 0.0
var _capsule_center := Vector3.ZERO
var _sim_off := false


func _ready() -> void:
	add_to_group(GROUP)
	collision_layer = LAYER_CREATURE
	collision_mask = LAYER_WORLD
	floor_snap_length = 0.6


func _prepare() -> void:
	_prepared = true
	_last_pos = global_position
	_leader = get_node_or_null(leader_path) as Node3D
	if _leader:
		_leader_last = _leader.global_position
	_action_t = randf_range(action_interval * 0.4, action_interval)
	_build_collider()
	_join_sim()

	_patrol = QPatrol.create(global_position, seed)
	_patrol.set_slot(formation_slot, formation_count)
	_patrol.use_preset(preset)
	_patrol.set_body(_radius)


func body_radius() -> float:
	return _radius


func _measure_reach() -> void:
	if _reach_frames >= REACH_FRAMES or rig == null or not rig.has_method("body_reach"):
		return
	_reach_frames += 1
	_reach = maxf(_reach, rig.body_reach())
	if _reach_frames >= REACH_FRAMES and _reach > _radius:
		_patrol.set_body(_reach)


func _build_collider() -> void:
	for child in get_children():
		if child is CollisionShape3D:
			var existing := (child as CollisionShape3D).shape
			if existing is CapsuleShape3D:
				_radius = (existing as CapsuleShape3D).radius
			return
	var radius := collider_radius
	var height := collider_height
	var floor_y := 0.0
	if (radius <= 0.0 or height <= 0.0) and rig and rig.has_method("mesh_extents"):
		var box: AABB = rig.mesh_extents()
		if height <= 0.0:
			height = box.size.y
			floor_y = box.position.y
		if radius <= 0.0:
			radius = minf(box.size.x, box.size.z) * collider_radius_scale
	radius = maxf(radius, 0.2)
	height = maxf(height, radius * 2.0 + 0.1)

	_radius = radius
	_capsule_half_height = maxf(height * 0.5 - radius, 0.05)
	_capsule_center = Vector3(0.0, floor_y + height * 0.5, 0.0)
	var capsule := CapsuleShape3D.new()
	capsule.radius = radius
	capsule.height = height
	var shape := CollisionShape3D.new()
	shape.shape = capsule
	shape.position = Vector3(0.0, floor_y + height * 0.5, 0.0)
	add_child(shape)
	if OS.get_environment("Q_MOVE_DEBUG") != "":
		print("[creature] %s capsule radius=%.2f height=%.2f" % [
				rig.display_name if rig else "?", radius, height])


func _physics_process(delta: float) -> void:
	if rig == null:
		return
	if not _prepared:
		_prepare()
	_join_sim()
	if rig.has_method("is_dead") and rig.is_dead():
		velocity = Vector3(0.0, velocity.y, 0.0)
		_step(delta)
		return

	_measure_reach()

	_patrol.observe(global_position, _flat_facing(),
			Vector3(velocity.x, 0.0, velocity.z), _travelled, _crowd())

	_observe_route()

	if _leader:
		var moved := _leader.global_position - _leader_last
		moved.y = 0.0
		_leader_last = _leader.global_position
		_patrol.observe_leader(_leader.global_position,
				-_leader.global_transform.basis.z, moved.length() / maxf(delta, 0.0001))
	else:
		_patrol.clear_leader()

	var out: Dictionary = _patrol.step(delta)
	_mode = out["mode"]
	var face: Vector3 = out["face"]
	_face(face, delta)

	var wish: Vector3 = out["wish"]
	_drive(wish, delta)

	if action_interval > 0.0 and velocity.length() > 0.5:
		_action_t -= delta
		if _action_t <= 0.0:
			_action_t = randf_range(action_interval * 0.6, action_interval * 1.4)
			var attacks: Array = rig.ATTACKS
			rig.play_action(attacks[randi() % attacks.size()])


func _observe_route() -> void:
	var spawner := get_parent()
	if _leader == null or spawner == null or not ("field" in spawner) or spawner.field == null:
		_patrol.clear_route()
		return
	var field = spawner.field
	var reachable: bool = field.distance_at(global_position) >= 0.0 \
			and not field.under_deck(global_position)
	if not reachable:
		var escape := _escape_route(field)
		if escape != Vector3.ZERO:
			_patrol.observe_route(escape, true)
			return
	_patrol.observe_route(field.direction_at(global_position), reachable)


func _escape_route(field) -> Vector3:
	var here := global_position
	for radius in ESCAPE_RINGS:
		var best := Vector3.ZERO
		var best_cost := INF
		for i in ESCAPE_SAMPLES:
			var angle := TAU * float(i) / float(ESCAPE_SAMPLES)
			var at := here + Vector3(cos(angle), 0.0, sin(angle)) * radius
			if field.under_deck(at):
				continue
			var cost: float = field.distance_at(at)
			if cost >= 0.0 and cost < best_cost:
				best_cost = cost
				best = at - here
		if best != Vector3.ZERO:
			best.y = 0.0
			return best.normalized()
	return Vector3.ZERO


func _crowd() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	var here := global_position
	var reach: float = _patrol.separation()
	for other in get_tree().get_nodes_in_group(GROUP):
		if other == self:
			continue
		var body := other as CharacterBody3D
		if body == null:
			continue
		var at := body.global_position
		if absf(at.x - here.x) > reach or absf(at.z - here.z) > reach:
			continue
		out.append(at.x)
		out.append(at.z)
		out.append(body.velocity.x)
		out.append(body.velocity.z)
		out.append(body.body_radius() if body.has_method("body_radius") else 1.0)
	return out


func _drive(wish: Vector3, delta: float) -> void:
	var flat := Vector3(velocity.x, 0.0, velocity.z)
	flat = flat.move_toward(Vector3(wish.x, 0.0, wish.z), MAX_ACCEL * delta)
	velocity.x = flat.x
	velocity.z = flat.z
	if _grounded():
		velocity.y = 0.0
	else:
		velocity.y += get_gravity().y * delta
	_step(delta)


func _join_sim() -> void:
	if _sim_off or _sim_id != 0:
		return
	if OS.get_environment("Q_GODOT_PHYSICS") != "":
		_sim_off = true
		return
	var scene := get_tree().current_scene
	var node: Node = scene.get_node_or_null(^"Physics") if scene else null
	if node == null or not node.has_method("spawn_character"):
		_sim_off = true
		return
	if not node.is_terrain_ready():
		return
	_sim = node
	_sim_id = _sim.spawn_character(self, _capsule_half_height, _radius, _capsule_center,
			collision_layer, collision_mask)


func _grounded() -> bool:
	return _sim.character_grounded(_sim_id) if _sim_id != 0 else is_on_floor()


func _exit_tree() -> void:
	if _sim_id != 0 and is_instance_valid(_sim):
		_sim.despawn(_sim_id)
		_sim_id = 0


func _step(delta: float) -> void:
	if _sim_id != 0:
		_sim.move_character(_sim_id, velocity * delta)
	else:
		move_and_slide()
	var moved := global_position - _last_pos
	_last_pos = global_position
	moved.y = 0.0
	var travelled := moved.length()
	_travelled = travelled
	rig.set_speed(_ground_speed(travelled, delta))
	if travelled > 0.0005:
		motion_dot = _flat_facing().dot(moved.normalized())


func _ground_speed(travelled: float, delta: float) -> float:
	if _sim_id == 0:
		return travelled / maxf(delta, 0.0001)
	return Vector2(velocity.x, velocity.z).length()


func _flat_facing() -> Vector3:
	var facing := -global_transform.basis.z
	facing.y = 0.0
	return facing.normalized()


func _face(dir: Vector3, delta: float) -> void:
	if dir.length_squared() < 0.0001:
		return
	var wanted := atan2(-dir.x, -dir.z)
	rotation.y = lerp_angle(rotation.y, wanted, clampf(turn_rate * delta, 0.0, 1.0))
