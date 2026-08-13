extends Node3D

## Steers a creature, either following a leader or roaming a home area.
##
## Allies follow: given a leader, each creature holds a slot in formation behind
## it and closes the gap at a speed set by how far behind it is, which is what
## makes it walk when it is nearly there and run when it has fallen behind. With
## no leader it roams its spawn area instead, which is what a wild creature or a
## staged encounter wants.
##
## Kinematic on purpose: the position is written directly and settled onto the
## terrain height each frame, rather than going through a body and move_and_slide.
## A creature this size wants a collider shaped to it and a real controller, and
## neither of those is decided yet -- so this stays a driver for looking at
## locomotion, and gets replaced rather than extended when the combat is built.

@export var rig: Node3D
@export var terrain_path: NodePath
## Followed when set. Empty means roam instead.
@export var leader_path: NodePath
## Which slot in the formation this one holds, spread sideways behind the leader so
## allies do not queue up in single file.
@export var formation_slot := 0
@export var formation_count := 1
@export var formation_distance := 7.0
## Sideways gap between slots. Has to be at least the separation radius, or the
## formation asks them to stand closer than the push-apart allows and they jostle
## in place forever instead of settling.
@export var formation_spacing := 9.0
## Slots per rank. Everything abreast makes a line as wide as the count times the
## spacing, which at four mechs is wider than a road and stops reading as a group,
## so they stack into ranks instead.
@export var formation_columns := 2
@export var rank_depth := 9.0
## Near enough to its slot to just stand there, rather than shuffling every time
## the leader breathes. Generous on purpose: an ally that insists on an exact spot
## fights the push-apart from its neighbours and neither ever settles.
@export var follow_deadzone := 3.5
## Starts walking again only past follow_deadzone times this. Without the gap it
## flickers between standing and walking on the boundary.
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
## Creatures push apart inside this radius. Nothing here collides -- the driver is
## kinematic -- so without it two of them walk into the same patch of ground and
## the meshes interpenetrate, which is the first thing the eye catches.
@export var separation := 9.0
@export var separation_strength := 1.6
## Held still on arrival before picking somewhere new, so it does not read as a
## machine on rails.
@export var pause_range := Vector2(0.8, 2.6)
## Rough seconds between one-shots while moving. Zero to leave them alone.
@export var action_interval := 7.0

var _terrain: Node
var _leader: Node3D
var _home := Vector3.ZERO
var _target := Vector3.ZERO
var _pause := 0.0
var _action_t := 0.0
var _prepared := false
var _idling := false
## Facing against actual displacement, reported by the debug screenshot. Negative
## means the body travelled backwards under an animation playing forwards, which
## is the signature of something moving the body that the rig was not told about.
var motion_dot := 1.0
var _last_pos := Vector3.ZERO


const GROUP := &"creature_patrol"


func _ready() -> void:
	add_to_group(GROUP)


## Resolved on the first step rather than in _ready, because add_child is what
## runs _ready and a spawner naturally sets the paths and the position after that.
## Reading them in _ready silently left every creature leaderless and roaming.
func _prepare() -> void:
	_prepared = true
	_home = global_position
	_leader = get_node_or_null(leader_path) as Node3D
	_terrain = get_node_or_null(terrain_path)
	if _terrain == null:
		_terrain = get_tree().current_scene.get_node_or_null("Terrain")
	_action_t = randf_range(action_interval * 0.4, action_interval)
	_pick_target()


func _physics_process(delta: float) -> void:
	if rig == null:
		return
	if not _prepared:
		_prepare()
	var was := _last_pos
	_last_pos = global_position
	if rig.has_method("is_dead") and rig.is_dead():
		return

	if _leader:
		_follow(delta)
		return

	if _pause > 0.0:
		_pause -= delta
		_commit(delta)
		return

	var to := _target - global_position
	to.y = 0.0
	if to.length() <= arrive_distance:
		_pause = randf_range(pause_range.x, pause_range.y)
		_pick_target()
		return

	var dir := to.normalized()
	# Turned toward the heading rather than snapped onto it, so a new waypoint
	# does not spin a thirty-tonne machine on the spot.
	_face(dir, delta)

	# Travelled along where it is actually facing, not where it wants to go, so
	# the feet and the motion agree while it is still coming round.
	var facing := -global_transform.basis.z
	facing.y = 0.0
	var travel := speed * maxf(facing.normalized().dot(dir), 0.0)
	global_position += facing.normalized() * travel * delta
	global_position += _separation() * separation_strength * delta
	_commit(delta)

	if action_interval > 0.0:
		_action_t -= delta
		if _action_t <= 0.0:
			_action_t = randf_range(action_interval * 0.6, action_interval * 1.4)
			var attacks: Array = rig.ATTACKS
			rig.play_action(attacks[randi() % attacks.size()])


## Holds a slot behind the leader, at a speed set by the gap left to close, and
## stands about once it is near enough that the exact spot stops mattering.
##
## Judged against the slot rather than against the leader, so every ally is working
## toward the same thing. Mixing the two -- some parking where they stand, others
## still driving for a slot -- leaves the parked ones being shoved off station by
## the push-apart and the moving ones chasing through them, and nothing settles.
func _follow(delta: float) -> void:
	var slot := _slot()
	var to := slot - global_position
	to.y = 0.0
	var gap := to.length()

	if _idling:
		_idling = gap <= follow_deadzone * follow_release
	else:
		_idling = gap <= follow_deadzone
	if _idling:
		# Turned to match the leader while stood still, so a waiting ally faces the
		# same way as whoever it is following.
		_face(-_leader.global_transform.basis.z, delta)
		global_position += _separation() * separation_strength * delta
		_commit(delta)
		return

	var dir := to / gap
	_face(dir, delta)
	var ramp := clampf((gap - follow_deadzone) / maxf(sprint_distance - follow_deadzone, 0.01), 0.0, 1.0)
	var travel := lerpf(speed, max_speed, ramp)
	var facing := -global_transform.basis.z
	facing.y = 0.0
	facing = facing.normalized()
	travel *= maxf(facing.dot(dir), 0.0)
	global_position += facing * travel * delta
	global_position += _separation() * separation_strength * delta
	_commit(delta)


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


## Settles onto the ground and tells the rig how fast the body actually moved.
##
## Derived from the displacement rather than from the intended travel, because the
## separation push moves the body too. Feeding intent instead let a creature that
## was only being shoved aside play a standing idle while it slid, which is what
## reads as the feet not belonging to the motion.
func _commit(delta: float) -> void:
	if _terrain and _terrain.has_method("height_at"):
		global_position.y = _terrain.height_at(global_position.x, global_position.z)
	var moved := global_position - _last_pos
	moved.y = 0.0
	var travelled := moved.length()
	rig.set_speed(travelled / maxf(delta, 0.0001))
	if travelled > 0.0005:
		var facing := -global_transform.basis.z
		facing.y = 0.0
		motion_dot = facing.normalized().dot(moved.normalized())


func _pick_target() -> void:
	var angle := randf() * TAU
	var radius := sqrt(randf()) * roam_radius
	_target = _home + Vector3(cos(angle) * radius, 0.0, sin(angle) * radius)
