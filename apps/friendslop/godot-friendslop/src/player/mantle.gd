extends RefCounted

## Gets the player over, or out of, whatever the movement code cannot resolve
## on its own. Three cases, in the order they are checked.
##
## Buried. The capsule ends up inside collision geometry, reporting contacts on
## every side and a floor on none. Nothing recovers from this by itself: with no
## floor the body is airborne forever, gravity keeps adding to a fall that never
## happens, and the rig is told it is in mid-air the whole time. That is the
## permanent falling animation, and it is a depenetration problem rather than a
## climbing one, so it is answered by pushing the body back out.
##
## Pinned. Held between two faces that slide it nowhere -- a rock beside a
## bridge post. Climbing out happens without being asked, because there is no
## input the player could press that would help.
##
## Falling past a ledge. Catching the edge is what a person would do, so the
## climb is offered in mid-air the same way it is on the ground.
##
## A deliberate climb, jump pressed against a wall, is allowed at any time.
##
## Every climb is shape-tested at the destination before anything moves. The
## body is carried there rather than simulated, so arriving inside geometry is
## the one outcome that would matter -- and is exactly the state the first case
## above exists to get out of.

## How high a ledge any entry will take, measured from the feet.
const REACH_HEIGHT := 1.7
## Under this it is a step, and the body walks up it unaided.
const MIN_HEIGHT := 0.3
## How far below the feet a ledge can still be caught on the way past. Only
## falling reaches down: on the ground there is nothing below the feet to climb.
const CATCH_BELOW := -0.8
## How far past the blocking face the ground is looked for. Short of this the
## probe comes down on the near wall; well beyond it a narrow post reads as
## climbable when there is nothing on top to stand on.
const LEDGE_REACH := 0.5
## Ledge has to be at least this deep to be worth standing on.
const LEDGE_DEPTH := 0.35
## How long the body has to make no progress, while pushing, before the jam is
## treated as real rather than as a graze on a corner.
const STUCK_TIME := 0.35
const STUCK_SPEED := 0.8
## Burial is answered faster than a jam: nothing about it improves with waiting,
## and every frame spent in it is a frame of falling animation.
const BURIED_TIME := 0.15
## Steps taken out along the escape direction, and how far the search runs
## before giving up on that direction and trying straight up.
const ESCAPE_STEP := 0.08
const ESCAPE_REACH := 2.0
## Used only when the rig has no climb clip to take a length from.
const FALLBACK_CLIMB := 0.45
## Fraction of the climb spent rising. The rest carries the body in over the
## edge, so the feet clear it rather than cutting the corner.
const RISE_PHASE := 0.6

var _body: CharacterBody3D
var _rig: Node
var _shape: CapsuleShape3D
## Copy of the body's own capsule, shrunk so a test standing exactly on a
## surface does not report itself as buried in it.
var _probe_shape: CapsuleShape3D
## Grown instead of shrunk, for the escape. Clearing the shrunk capsule means
## the real one still grazes, so the body sinks back in and creeps out a step
## per frame; an escape has to land somewhere with room around it.
var _escape_shape: CapsuleShape3D
var _radius := 0.5
var _height := 2.0

var _stuck := 0.0
var _sunk := 0.0
var _time := 0.0
var _span := FALLBACK_CLIMB
var _from := Vector3.ZERO
var _to := Vector3.ZERO
var active := false
## Why the last attempt was turned down, for Q_MANTLE_DEBUG.
var _why := ""


func setup(body: CharacterBody3D, rig: Node) -> void:
	_body = body
	_rig = rig
	var col := body.get_node_or_null("CollisionShape3D") as CollisionShape3D
	if col == null or not (col.shape is CapsuleShape3D):
		return
	_shape = col.shape
	_radius = _shape.radius
	_height = _shape.height
	_probe_shape = _shape.duplicate()
	_probe_shape.radius = maxf(0.05, _radius - 0.03)
	_probe_shape.height = maxf(_probe_shape.radius * 2.0 + 0.02, _height - 0.06)
	_escape_shape = _shape.duplicate()
	_escape_shape.radius = _radius + 0.03
	_escape_shape.height = _height + 0.06


## Returns true while a climb or an escape owns the body, which is the caller's
## cue to leave gravity and move_and_slide alone.
func update(delta: float, wish: Vector3, jump: bool) -> bool:
	if _body == null or _shape == null:
		return false
	if active:
		_advance(delta)
		return true

	var flat := Vector3(wish.x, 0.0, wish.z)
	flat = flat.normalized() if flat.length_squared() > 0.0001 else Vector3.ZERO

	var moving := _body.get_real_velocity().length() > STUCK_SPEED
	var grounded := _body.is_on_floor()
	var touching := _body.get_slide_collision_count() > 0

	# Checked first, and without asking for input: a buried body cannot walk,
	# jump or climb its way out, so waiting for the player to press something is
	# waiting forever.
	if not grounded and touching and not moving:
		_sunk += delta
		if _sunk >= BURIED_TIME and _dig_out():
			return true
	else:
		_sunk = 0.0

	if flat == Vector3.ZERO:
		_stuck = 0.0
		return false

	var upright := cos(_body.floor_max_angle)
	var blocked := false
	var against := Vector3.ZERO
	var worst := -0.3
	var walls: Array[Vector3] = []
	for i in _body.get_slide_collision_count():
		var hit := _body.get_slide_collision(i)
		var normal := hit.get_normal()
		if normal.y >= upright:
			continue
		walls.append(normal)
		# The wall being pushed into, as opposed to the ones being brushed past.
		# Without the direction test, running along a bridge counts as blocked
		# the whole way.
		var into := normal.dot(flat)
		if into < worst:
			worst = into
			against = hit.get_position()
			blocked = true

	# Pinned, as opposed to merely leaning on something. One wall is never a
	# trap -- the way out is to walk away from it -- so a body held up by a
	# single wall is a player pressing into a cliff, and hoisting them up it
	# uninvited is the behaviour to avoid. Two walls facing each other leave
	# nowhere to slide, and that is the case worth climbing out of.
	var pinned := false
	for i in walls.size():
		for j in range(i + 1, walls.size()):
			if walls[i].dot(walls[j]) < -0.1:
				pinned = true

	if not grounded:
		_stuck = 0.0
		# Nothing is being slid against in mid-air, so the wall has to be found
		# by looking rather than read off a contact.
		if _body.velocity.y < 0.0:
			return _start(flat, _reach_out(flat))
		return false

	if jump and blocked:
		return _start(flat, _find_ledge(flat, against, MIN_HEIGHT, REACH_HEIGHT))

	if blocked and not moving:
		_stuck += delta
	else:
		_stuck = 0.0
	if pinned and _stuck >= STUCK_TIME:
		return _start(flat, _find_ledge(flat, against, MIN_HEIGHT, REACH_HEIGHT))
	return false


## Pushes the body back out of the geometry it is inside of. The contacts all
## face outwards, so their sum is the way out; the distance is found by walking
## along it until the capsule fits, since how deep the body sank is not
## something the contacts report.
func _dig_out() -> bool:
	var out := Vector3.ZERO
	for i in _body.get_slide_collision_count():
		out += _body.get_slide_collision(i).get_normal()
	if out.length_squared() < 0.000001:
		out = Vector3.UP
	out = out.normalized()

	var space := _body.get_world_3d().direct_space_state
	var mask := _body.collision_mask
	var skip: Array[RID] = [_body.get_rid()]
	var here := _body.global_position
	var debug := OS.get_environment("Q_MANTLE_DEBUG") != ""
	for i in range(1, int(ESCAPE_REACH / ESCAPE_STEP) + 1):
		var d := i * ESCAPE_STEP
		# Straight up is tried at every distance alongside the contact normals,
		# because a body sunk through a floor has every contact pointing at the
		# hole it fell through and none of them pointing at the room above it.
		var ways: Array[Vector3] = [out, Vector3.UP]
		for way in ways:
			var spot: Vector3 = here + way * d
			if not _clear(space, spot, mask, skip, _escape_shape):
				continue
			if debug:
				print("[mantle] dug out %.2fm along (%.2f,%.2f,%.2f)" % [
						d, way.x, way.y, way.z])
			_body.global_position = spot
			_body.velocity = Vector3.ZERO
			_sunk = 0.0
			return true
	if debug:
		print("[mantle] buried at %.1f,%.1f,%.1f, no room within %.1fm" % [
				here.x, here.y, here.z, ESCAPE_REACH])
	return false


## Ledge found by looking, for when there is no contact to hang the probe off,
## which is every mid-air case.
func _reach_out(dir: Vector3) -> Vector3:
	var space := _body.get_world_3d().direct_space_state
	var mask := _body.collision_mask
	var skip: Array[RID] = [_body.get_rid()]
	var feet := _body.global_position
	# Swept at several heights rather than one. An edge caught while falling can
	# be anywhere between the knees and the head by the time the hand reaches
	# it, and a single ray decides in advance which of those counts.
	var heights: Array[float] = [1.4, 1.0, 0.6, 0.2]
	for h in heights:
		var at: Vector3 = feet + Vector3.UP * h
		var ray := PhysicsRayQueryParameters3D.create(at,
				at + dir * (_radius + LEDGE_REACH), mask, skip)
		var wall := space.intersect_ray(ray)
		if wall.is_empty() or (wall.normal as Vector3).y >= cos(_body.floor_max_angle):
			continue
		var ledge := _find_ledge(dir, wall.position, CATCH_BELOW, REACH_HEIGHT)
		if ledge != Vector3.INF:
			return ledge
	return _refuse("nothing within reach")


func _refuse(reason: String) -> Vector3:
	_why = reason
	return Vector3.INF


## Where the body would stand after climbing, or INF if there is nowhere it
## could safely end up.
##
## `against` is a point on the obstacle itself, and the probe is hung off it
## rather than off a ray cast forward at chest height. A boulder that stops the
## capsule at knee level passes under a chest ray, which reports open air ahead
## and refuses to climb the very thing doing the blocking.
func _find_ledge(dir: Vector3, against: Vector3, low: float, high: float) -> Vector3:
	var space := _body.get_world_3d().direct_space_state
	var feet := _body.global_position
	var mask := _body.collision_mask
	var skip: Array[RID] = [_body.get_rid()]

	var over := Vector3(against.x, feet.y, against.z) + dir * LEDGE_REACH
	var top := PhysicsRayQueryParameters3D.create(
			over + Vector3.UP * (high + 0.2), over + Vector3.UP * low, mask, skip)
	var ledge := space.intersect_ray(top)
	if ledge.is_empty():
		return _refuse("no top between %.2f and %.2f" % [low, high])
	var stand: Vector3 = ledge.position
	var rise := stand.y - feet.y
	if rise < low or rise > high:
		return _refuse("rise %.2f outside [%.2f, %.2f]" % [rise, low, high])
	# Standing on a slope the body could not hold is worse than staying put.
	if (ledge.normal as Vector3).y < cos(_body.floor_max_angle):
		return _refuse("top too steep, n.y=%.2f" % (ledge.normal as Vector3).y)

	# A post capped with a 12cm box passes every test above and is still not
	# somewhere to stand, so the far side of the landing is checked for ground
	# at the same level before it counts as a ledge rather than a spike.
	var far := stand + dir * LEDGE_DEPTH + Vector3.UP * 0.2
	var depth := PhysicsRayQueryParameters3D.create(far, far - Vector3.UP * 0.4, mask, skip)
	if space.intersect_ray(depth).is_empty():
		return _refuse("ledge shallower than %.2fm" % LEDGE_DEPTH)

	if not _clear(space, Vector3(feet.x, stand.y, feet.z), mask, skip):
		return _refuse("no headroom to rise")
	if not _clear(space, stand, mask, skip):
		return _refuse("landing blocked")
	_why = ""
	return stand


func _start(dir: Vector3, landing: Vector3) -> bool:
	var debug := OS.get_environment("Q_MANTLE_DEBUG") != ""
	if landing == Vector3.INF:
		if debug:
			print("[mantle] refused at %.1f,%.1f,%.1f dir=(%.2f,%.2f): %s" % [
					_body.global_position.x, _body.global_position.y,
					_body.global_position.z, dir.x, dir.z, _why])
		return false
	_from = _body.global_position
	_to = landing
	_time = 0.0
	_stuck = 0.0
	_sunk = 0.0
	active = true
	_body.velocity = Vector3.ZERO
	# The clip decides how long the climb takes, so the hands meet the ledge
	# instead of the body arriving early and the animation catching up.
	_span = FALLBACK_CLIMB
	if _rig and _rig.has_method("play_climb"):
		var clip: float = _rig.play_climb(_to.y - _from.y)
		if clip > 0.05:
			_span = clip
	if debug:
		print("[mantle] climb %+.2fm over %.2fs to %.1f,%.1f,%.1f" % [
				_to.y - _from.y, _span, _to.x, _to.y, _to.z])
	return true


## Whether the body's own capsule fits at a spot, with its feet on it.
func _clear(space: PhysicsDirectSpaceState3D, feet: Vector3, mask: int,
		skip: Array[RID], shape: CapsuleShape3D = null) -> bool:
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = shape if shape else _probe_shape
	query.collision_mask = mask
	query.exclude = skip
	query.transform = Transform3D(Basis(), feet + Vector3.UP * (_height * 0.5 + 0.02))
	return space.intersect_shape(query, 1).is_empty()


## Up first, across second. Interpolating straight to the landing drags the
## capsule through the edge it is climbing, which the physics server resolves by
## shoving the body back out the way it came.
func _advance(delta: float) -> void:
	_time += delta
	var t := clampf(_time / _span, 0.0, 1.0)
	var rise := smoothstep(0.0, RISE_PHASE, t)
	var reach := smoothstep(RISE_PHASE, 1.0, t)
	_body.global_position = Vector3(
			lerpf(_from.x, _to.x, reach),
			lerpf(_from.y, _to.y, rise),
			lerpf(_from.z, _to.z, reach))
	_body.velocity = Vector3.ZERO
	if t >= 1.0:
		active = false
		if _rig and _rig.has_method("end_climb"):
			_rig.end_climb()
