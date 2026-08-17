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
## Seconds ahead the dodge looks. Short enough and it only reacts after contact;
## long enough and it swerves round creatures it was never going to meet.
@export var look_ahead := 1.8
## Clearance wanted on top of the two capsule radii when passing somebody.
@export var pass_margin := 0.8
## Nobody gets closer to the leader than this. The leader is usually the player.
@export var personal_space := 3.5
## Rough seconds between one-shots while moving.
@export var action_interval := 7.0

@export var collider_radius := 0.0
@export var collider_height := 0.0
@export var collider_radius_scale := 0.4

const GROUP := &"creature_patrol"

## Creatures sit on their own layer and do not mask it, so they pass through each
## other in the engine while still colliding with the world and the player.
##
## Two separate problems this fixes. Avoidance is already the solver's job, and it
## has the whole picture -- who is moving where, how soon they meet, which way to
## step. Depenetration has none of that and shoves along the shortest axis, so the
## two fought: the solver would open a gap, the engine would close it, and neither
## could see what the other had done. That fight is what the walking-on-the-spot
## was made of. The second problem is that the shortest axis between two capsules
## on any kind of slope is often vertical, which puts one machine on top of
## another, and a capsule resting on a capsule reports `is_on_floor`, so it stays
## up there with its gravity cancelled until something moves the one underneath.
const LAYER_WORLD := 1
const LAYER_CREATURE := 4

## Radii searched for walkable ground when a creature is stuck inside a blocked
## region. The widest has to clear the river plus the field's clearance inflation.
const ESCAPE_RINGS: Array[float] = [4.0, 8.0, 14.0, 22.0]
const ESCAPE_SAMPLES := 12
## Facing gates forward speed, so a creature leans into its turn rather than
## sliding sideways. Never to zero: that was half of why they got stuck.
const TURN_GATE_FLOOR := 0.35
## Physics frames the silhouette is sampled over, which has to span a full stride
## or it catches the creature mid-step with its legs together.
const REACH_FRAMES := 120
## Ground speed change per second. Reaches a sprint in about a quarter second,
## which is brisk for something this size and still far too slow to buzz.
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
## The capsule this body actually got, which is what avoidance measures against.
var _radius := 1.0
## The silhouette avoidance keeps clear of, which is the whole machine rather
## than the capsule. Sampled over the first stride, because the rest pose has the
## arms out and the answer only means anything once the walk cycle is playing.
var _reach := 0.0
var _reach_frames := 0

var _sim: Node
## Sim body id, or 0 while this body is still on Godot physics.
var _sim_id := 0
## Capsule handed to the sim, kept from _build_collider so the two describe one body.
var _capsule_half_height := 0.0
var _capsule_center := Vector3.ZERO
## Set once the scene is known to have no sim to join, so the lookup stops repeating.
var _sim_off := false


func _ready() -> void:
	add_to_group(GROUP)
	collision_layer = LAYER_CREATURE
	collision_mask = LAYER_WORLD
	# The default snap is 0.1, which a mech at a sprint clears on any downhill it
	# meets, and it then coasts to the top of an arc before gravity catches it.
	# Long enough here to hold the body on ground it is walking down.
	floor_snap_length = 0.6


## Resolved on the first step rather than in _ready, because add_child is what runs
## _ready and a spawner naturally sets the paths and the position after that.
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
	_patrol.configure(speed, max_speed, roam_radius, arrive_distance, separation,
			separation_strength, personal_space, formation_distance, formation_spacing,
			formation_columns, rank_depth, hold_radius)
	_patrol.set_body(_radius, look_ahead, pass_margin)


func body_radius() -> float:
	return _radius


## Widest the creature gets over one stride, handed to the solver as the distance
## to keep from its neighbours.
##
## Deliberately not the capsule: that is the hard body and has to stay small
## enough to cross a three metre bridge deck. This is what a viewer sees, and
## avoidance sized off the capsule instead let two of the wider mechs walk
## through each other for one frame in six.
func _measure_reach() -> void:
	if _reach_frames >= REACH_FRAMES or rig == null or not rig.has_method("body_reach"):
		return
	_reach_frames += 1
	_reach = maxf(_reach, rig.body_reach())
	if _reach_frames >= REACH_FRAMES and _reach > _radius:
		_patrol.set_body(_reach, look_ahead, pass_margin)


func _build_collider() -> void:
	for child in get_children():
		if child is CollisionShape3D:
			var existing := (child as CollisionShape3D).shape
			if existing is CapsuleShape3D:
				_radius = (existing as CapsuleShape3D).radius
			return
	var radius := collider_radius
	var height := collider_height
	# Where the mesh starts above the body origin, which is not always zero: a rig
	# authored around its hips puts its feet below, one authored on a plinth puts
	# them above. Sizing the capsule off the extent while placing it as though the
	# extent began at the origin is what leaves a machine hanging over its own feet.
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
	var field = spawner.field
	# A field that cannot route from here is a different answer from no field at
	# all: it means there is no way through, and walking at the leader anyway is
	# how a creature ends up leaning on a riverbank.
	# Under a bridge rather than on it. The field is flat, so the deck and the
	# riverbed beneath it share a cell and every route it hands out down there is
	# for a body one storey up.
	var reachable: bool = field.distance_at(global_position) >= 0.0 \
			and not field.under_deck(global_position)
	if not reachable:
		# Standing inside the blocked region rather than looking at it from
		# outside. Reporting that as blocked parks the creature in MODE_WAITING
		# facing the leader, and nothing in that state moves it, so it waits there
		# for the rest of the session. Spawn placement puts mechs in the river on
		# its own, and anything that shoves one in later does the same.
		var escape := _escape_route(field)
		if escape != Vector3.ZERO:
			_patrol.observe_route(escape, true)
			return
	_patrol.observe_route(field.direction_at(global_position), reachable)


## Shortest way back to ground the field can route from, or zero if there is none
## within reach. Rings outward because the gradient inside a blocked region points
## nowhere useful — there is no route out of a cell the integration never entered.
func _escape_route(field) -> Vector3:
	var here := global_position
	for radius in ESCAPE_RINGS:
		var best := Vector3.ZERO
		var best_cost := INF
		for i in ESCAPE_SAMPLES:
			var angle := TAU * float(i) / float(ESCAPE_SAMPLES)
			var at := here + Vector3(cos(angle), 0.0, sin(angle)) * radius
			# Samples keep this creature's height, so anything still under the
			# deck is rejected here rather than picked as a way out from under it.
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


## Every other creature within reach, as the flat `x, z, vx, vz, radius` the
## solver reads. The leader goes in separately: it is avoided harder than a peer.
##
## Velocity and radius are here because position alone only says who is nearby.
## Whether this creature is about to walk into them is a different question, and
## the one that decides whether it steps aside or brakes into a jam.
func _crowd() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	var here := global_position
	var reach := separation
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


## Applies a horizontal wish, keeps gravity on the vertical, and slides against the
## world.
##
## The wish is approached rather than assigned. Written straight to velocity it can
## reverse completely between one frame and the next, which is fine for the solver
## -- it is describing an intent -- but it means nothing damps a disagreement. Two
## creatures reading each other's avoidance can settle into a buzz at frame rate,
## and a machine this size does not change its mind about which way it is walking
## in a sixtieth of a second anyway.
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


## The off-thread sim, if the scene has one. Each creature otherwise runs its own
## `move_and_slide` on the main thread, and they are the population that grows.
##
## Retried rather than resolved once: a character spawned before the ground exists has
## nothing to stand on, and creatures are built during the same frames the terrain is
## still baking.
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
	_sim_id = _sim.spawn_character(self, _capsule_half_height, _radius, _capsule_center)


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
