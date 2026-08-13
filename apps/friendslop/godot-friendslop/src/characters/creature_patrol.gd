extends CharacterBody3D

## Steers a creature, either following a leader or roaming a home area.
##
## Allies follow: given a leader, each creature works toward a slot in formation
## and closes the gap at a speed set by how far behind it is, which is what makes
## it walk when it is nearly there and run when it has fallen behind. Once it is
## near the leader and the leader has stopped, it stops too -- the exact slot is a
## destination to head for, not a spot it has to stand on. With no leader it roams
## its spawn area instead, which is what a wild creature or a staged encounter
## wants.
##
## A body rather than a bare Node3D, because the world's collision is Godot's:
## QTerrain builds a HeightMapShape3D under a StaticBody3D, road.rs builds the
## bridge and its ramps, and the stones carry their own. Writing the position
## directly and sampling terrain height ignored every one of those, which is what
## walked a mech through the bridge. move_and_slide uses the same colliders the
## player already does.

const CreatureRig := preload("res://src/characters/creature_rig.gd")

@export var rig: Node3D
## Followed when set. Empty means roam instead.
@export var leader_path: NodePath

## Which slot in the formation this one holds, spread sideways behind the leader so
## allies do not queue up in single file.
@export var formation_slot := 0
@export var formation_count := 1
@export var formation_distance := 7.0
## Sideways gap between slots. Has to be at least the separation radius, or the
## formation asks them to stand closer than the push-apart allows.
@export var formation_spacing := 9.0
## Slots per rank. Everything abreast makes a line as wide as the count times the
## spacing, which at four mechs is wider than a road and stops reading as a group,
## so they stack into ranks instead.
@export var formation_columns := 2
@export var rank_depth := 9.0

## Near enough to the leader to stop caring about the slot. Inside this, a creature
## holds position whenever the leader is holding position; it only sets off again
## when the leader does, or when it has drifted outside.
@export var hold_radius := 14.0
## Speed below which the leader counts as standing still.
@export var leader_idle_speed := 0.4
## Fallback for when the leader is moving but the slot is close enough anyway.
@export var follow_deadzone := 3.5
@export var follow_release := 1.8
## Gap at which it is running flat out. Between the deadzone and this the speed
## ramps, so the gait follows the gap rather than snapping between clips.
@export var sprint_distance := 14.0
## Has to beat the leader's top speed by a fair margin, not match it. A follower
## holds station where its ramped speed equals the leader's, so a max only just
## above the player's run settles the whole formation far further back than
## formation_distance: at 6.0 against a 5.0 player that equilibrium is 10.5 units.
@export var max_speed := 7.5

## Waypoints are drawn inside this radius of wherever the creature started.
@export var roam_radius := 22.0
@export var arrive_distance := 2.0
## Cruising speed. The rig blends its own clips against this, so it doubles as the
## walk-versus-run choice.
@export var speed := 2.6
@export var turn_rate := 2.5
## Creatures steer apart inside this radius. The bodies cannot overlap now, so this
## is only to stop them shouldering each other along a shared heading.
@export var separation := 9.0
@export var separation_strength := 1.6
## Held still on arrival before picking somewhere new, so it does not read as a
## machine on rails.
@export var pause_range := Vector2(0.8, 2.6)
## Rough seconds between one-shots while moving. Zero to leave them alone.
@export var action_interval := 7.0

## Zero derives both from the rig's mesh. The radius comes off the creature's
## shallowest horizontal extent rather than its widest: a mech's arm span is over
## seven units across while its legs are barely two, and a capsule as wide as the
## arms cannot cross its own bridge.
@export var collider_radius := 0.0
@export var collider_height := 0.0
@export var collider_radius_scale := 0.4

const GROUP := &"creature_patrol"

var motion_dot := 1.0

var _leader: Node3D
var _home := Vector3.ZERO
var _target := Vector3.ZERO
var _pause := 0.0
var _action_t := 0.0
var _prepared := false
var _holding := false
var _last_pos := Vector3.ZERO
var _leader_last := Vector3.ZERO
var _leader_speed := 0.0
var _gravity := -9.8


func _ready() -> void:
	add_to_group(GROUP)


## Resolved on the first step rather than in _ready, because add_child is what runs
## _ready and a spawner naturally sets the paths and the position after that.
## Reading them in _ready silently left every creature leaderless and roaming.
func _prepare() -> void:
	_prepared = true
	_home = global_position
	_last_pos = global_position
	_leader = get_node_or_null(leader_path) as Node3D
	if _leader:
		_leader_last = _leader.global_position
	_gravity = get_gravity().y if has_method("get_gravity") else -9.8
	_action_t = randf_range(action_interval * 0.4, action_interval)
	_build_collider()
	_pick_target()


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

	if _leader:
		var moved := _leader.global_position - _leader_last
		moved.y = 0.0
		_leader_speed = moved.length() / maxf(delta, 0.0001)
		_leader_last = _leader.global_position
		_follow(delta)
	else:
		_roam(delta)

	if action_interval > 0.0 and velocity.length() > 0.5:
		_action_t -= delta
		if _action_t <= 0.0:
			_action_t = randf_range(action_interval * 0.6, action_interval * 1.4)
			var attacks: Array = rig.ATTACKS
			rig.play_action(attacks[randi() % attacks.size()])


## Works toward its slot, but treats being near the leader as good enough whenever
## the leader is not going anywhere. Judging it on the leader's motion rather than
## on the slot alone is what stops an ally jockeying for an exact spot behind
## someone who is standing still.
func _follow(delta: float) -> void:
	var slot := _slot()
	var to_slot := slot - global_position
	to_slot.y = 0.0
	var gap := to_slot.length()

	var to_leader := _leader.global_position - global_position
	to_leader.y = 0.0
	var lead_gap := to_leader.length()

	var settled := _leader_speed <= leader_idle_speed and lead_gap <= hold_radius
	if _holding:
		_holding = settled and lead_gap <= hold_radius * follow_release
	else:
		_holding = settled and gap <= maxf(follow_deadzone, hold_radius * 0.5)
	if _holding or gap <= follow_deadzone:
		_face(-_leader.global_transform.basis.z, delta)
		_drive(_separation() * separation_strength, delta)
		return

	var dir := to_slot / gap
	_face(dir, delta)
	var ramp := clampf((gap - follow_deadzone) / maxf(sprint_distance - follow_deadzone, 0.01),
			0.0, 1.0)
	var wanted := lerpf(speed, max_speed, ramp)
	# Driven along where it is actually facing, not where it wants to go, so the
	# feet and the motion agree while it is still coming round.
	var facing := _flat_facing()
	_drive(facing * wanted * maxf(facing.dot(dir), 0.0)
			+ _separation() * separation_strength, delta)


func _roam(delta: float) -> void:
	if _pause > 0.0:
		_pause -= delta
		_drive(Vector3.ZERO, delta)
		return

	var to := _target - global_position
	to.y = 0.0
	if to.length() <= arrive_distance:
		_pause = randf_range(pause_range.x, pause_range.y)
		_pick_target()
		_drive(Vector3.ZERO, delta)
		return

	var dir := to.normalized()
	_face(dir, delta)
	var facing := _flat_facing()
	_drive(facing * speed * maxf(facing.dot(dir), 0.0)
			+ _separation() * separation_strength, delta)


## Applies a horizontal wish, keeps gravity on the vertical, and slides against the
## world. What the rig is told comes from the displacement that survived the slide,
## so a creature held up by the bridge railing stands rather than running on the
## spot against it.
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


## Ranks behind the leader, laid out on the leader's own axes so the formation
## turns with it.
func _slot() -> Vector3:
	var basis := _leader.global_transform.basis
	var back := Vector3(basis.z.x, 0.0, basis.z.z).normalized()
	var side := Vector3(basis.x.x, 0.0, basis.x.z).normalized()
	var columns := maxi(formation_columns, 1)
	var row := formation_slot / columns
	var col := formation_slot % columns
	# The last rank can be short, so it is centred on its own width rather than on
	# a full one, which would leave a lone straggler off to the side.
	var in_row := mini(columns, formation_count - row * columns)
	var lateral := formation_spacing * (col - (in_row - 1) * 0.5)
	return _leader.global_position + back * (formation_distance + row * rank_depth) \
			+ side * lateral


func _face(dir: Vector3, delta: float) -> void:
	if dir.length_squared() < 0.0001:
		return
	var wanted := atan2(-dir.x, -dir.z)
	rotation.y = lerp_angle(rotation.y, wanted, clampf(turn_rate * delta, 0.0, 1.0))


## Sum of the pushes away from every neighbour that is too close, falling off to
## nothing at the separation radius.
func _separation() -> Vector3:
	var push := Vector3.ZERO
	for other in get_tree().get_nodes_in_group(GROUP):
		if other == self:
			continue
		var away: Vector3 = global_position - (other as Node3D).global_position
		away.y = 0.0
		var distance := away.length()
		if distance < 0.001 or distance >= separation:
			continue
		push += away / distance * (1.0 - distance / separation)
	return push


func _pick_target() -> void:
	var angle := randf() * TAU
	var radius := sqrt(randf()) * roam_radius
	_target = _home + Vector3(cos(angle) * radius, 0.0, sin(angle) * radius)
