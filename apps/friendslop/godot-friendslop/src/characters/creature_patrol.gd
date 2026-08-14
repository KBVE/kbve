extends CharacterBody3D

## Drives a creature from the steering QPatrol decides, and reports back what the
## collision actually allowed.

const CreatureRig := preload("res://src/characters/creature_rig.gd")

@export var rig: Node3D
## Followed when set.
@export var leader_path: NodePath
## Decides this creature's wander. Spawn index is enough, and keeping it explicit
## is what lets two machines simulate the same creature the same way.
@export var seed := 0

@export var formation_slot := 0
@export var formation_count := 1
@export var formation_distance := 7.0
@export var formation_spacing := 9.0
@export var formation_columns := 2
@export var rank_depth := 9.0

@export var hold_radius := 14.0
@export var sprint_distance := 14.0
@export var max_speed := 7.5

@export var roam_radius := 22.0
@export var arrive_distance := 2.0
@export var speed := 2.6
@export var turn_rate := 2.5
@export var separation := 9.0
@export var separation_strength := 1.6
## Nobody gets closer to the leader than this. The leader is usually the player.
@export var personal_space := 3.5
## Rough seconds between one-shots while moving.
@export var action_interval := 7.0

@export var collider_radius := 0.0
@export var collider_height := 0.0
@export var collider_radius_scale := 0.4

const GROUP := &"creature_patrol"
## Facing gates forward speed, so a creature leans into its turn rather than
## sliding sideways. Never to zero: that was half of why they got stuck.
const TURN_GATE_FLOOR := 0.35

var motion_dot := 1.0

var _patrol: QPatrol
var _leader: Node3D
var _last_pos := Vector3.ZERO
var _leader_last := Vector3.ZERO
var _action_t := 0.0
var _prepared := false
var _gravity := -9.8
var _mode := 0


func _ready() -> void:
	add_to_group(GROUP)


## Resolved on the first step rather than in _ready, because add_child is what runs
## _ready and a spawner naturally sets the paths and the position after that.
func _prepare() -> void:
	_prepared = true
	_last_pos = global_position
	_leader = get_node_or_null(leader_path) as Node3D
	if _leader:
		_leader_last = _leader.global_position
	_gravity = get_gravity().y if has_method("get_gravity") else -9.8
	_action_t = randf_range(action_interval * 0.4, action_interval)
	_build_collider()

	_patrol = QPatrol.create(global_position, seed)
	_patrol.set_slot(formation_slot, formation_count)
	_patrol.configure(speed, max_speed, roam_radius, arrive_distance, separation,
			separation_strength, personal_space, formation_distance, formation_spacing,
			formation_columns, rank_depth, hold_radius)


func _build_collider() -> void:
	for child in get_children():
		if child is CollisionShape3D:
			return
	var radius := collider_radius
	var height := collider_height
	if (radius <= 0.0 or height <= 0.0) and rig and rig.has_method("mesh_extents"):
		var box: AABB = rig.mesh_extents()
		if height <= 0.0:
			height = box.size.y
		if radius <= 0.0:
			radius = minf(box.size.x, box.size.z) * collider_radius_scale
	radius = maxf(radius, 0.2)
	height = maxf(height, radius * 2.0 + 0.1)

	var capsule := CapsuleShape3D.new()
	capsule.radius = radius
	capsule.height = height
	var shape := CollisionShape3D.new()
	shape.shape = capsule
	shape.position = Vector3(0.0, height * 0.5, 0.0)
	add_child(shape)
	if OS.get_environment("Q_MOVE_DEBUG") != "":
		print("[creature] %s capsule radius=%.2f height=%.2f" % [
				rig.display_name if rig else "?", radius, height])


func _physics_process(delta: float) -> void:
	if rig == null:
		return
	if not _prepared:
		_prepare()
	if rig.has_method("is_dead") and rig.is_dead():
		velocity = Vector3(0.0, velocity.y, 0.0)
		_step(delta)
		return

	var travelled := (global_position - _last_pos)
	travelled.y = 0.0
	_patrol.observe(global_position, _flat_facing(), travelled.length(), _neighbours())

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
	# Unsticking has to move regardless of where the body is pointing, or the
	# creature turns away from the obstacle while still leaning on it.
	if _mode != QPatrol.MODE_UNSTICKING:
		var facing := _flat_facing()
		var gate := maxf(facing.dot(face), 0.0)
		wish *= lerpf(TURN_GATE_FLOOR, 1.0, gate)
	_drive(wish, delta)

	if action_interval > 0.0 and velocity.length() > 0.5:
		_action_t -= delta
		if _action_t <= 0.0:
			_action_t = randf_range(action_interval * 0.6, action_interval * 1.4)
			var attacks: Array = rig.ATTACKS
			rig.play_action(attacks[randi() % attacks.size()])


## The route out of the shared flow field, when one covers this creature.
##
## Only while following: the field is integrated to the leader, and a roaming
## creature is going somewhere else entirely, so it steers itself.
func _observe_route() -> void:
	var spawner := get_parent()
	if _leader == null or spawner == null or not ("field" in spawner) or spawner.field == null:
		_patrol.clear_route()
		return
	_patrol.observe_route(spawner.field.direction_at(global_position))


## Every other creature, so the solver can steer around them. The leader goes in
## separately: it is avoided harder than a peer is.
func _neighbours() -> PackedVector3Array:
	var out := PackedVector3Array()
	for other in get_tree().get_nodes_in_group(GROUP):
		if other == self:
			continue
		out.append((other as Node3D).global_position)
	return out


## Applies a horizontal wish, keeps gravity on the vertical, and slides against the
## world.
func _drive(wish: Vector3, delta: float) -> void:
	velocity.x = wish.x
	velocity.z = wish.z
	if is_on_floor():
		velocity.y = 0.0
	else:
		velocity.y += _gravity * delta
	_step(delta)


func _step(delta: float) -> void:
	move_and_slide()
	var moved := global_position - _last_pos
	_last_pos = global_position
	moved.y = 0.0
	var travelled := moved.length()
	rig.set_speed(travelled / maxf(delta, 0.0001))
	if travelled > 0.0005:
		motion_dot = _flat_facing().dot(moved.normalized())


func _flat_facing() -> Vector3:
	var facing := -global_transform.basis.z
	facing.y = 0.0
	return facing.normalized()


func _face(dir: Vector3, delta: float) -> void:
	if dir.length_squared() < 0.0001:
		return
	var wanted := atan2(-dir.x, -dir.z)
	rotation.y = lerp_angle(rotation.y, wanted, clampf(turn_rate * delta, 0.0, 1.0))
