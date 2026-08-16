extends Node3D

## Works whatever rock or tree the player is standing in front of, for as long as
## the button is held.
##
## Hung off the player next to the interactor, and aims the same way it does, so
## the two agree about what counts as "in front of me" and only differ in what
## they are looking for.
##
## Online this announces a job, not a swing. One message says the player has
## started on a tree and another says they have stopped; everything in between is
## the host's, which is what makes the animation free to run without waiting on
## anything. It also means the pace is not ours to set: a message per swing can
## always be sent faster than a swing takes, and no validation of one message
## fixes that, because each one is individually legitimate.
##
## The swing itself stays a window rather than a moment. The blow lands partway
## through, with wind-up before it and follow-through after, so the host's rulings
## have somewhere to arrive that is not in front of the player's eyes.
##
## Online the field is never damaged here. The host owns the ledger, and a client
## that damaged its own copy would show a rock breaking that the server never
## agreed to and then have to take it back. Offline there is no host, so the same
## swing clock does the counting locally.

signal swung(target: StringName, id: int)
signal harvested(target: StringName, ore: StringName, amount: int)
## What the next swing would hit, or an empty kind when there is nothing in reach.
## Emitted only when the answer changes, so a reticle can listen without polling.
signal aimed(target: StringName, info: Dictionary)

const GROUP := &"harvester"
const STONE := &"stone"
const TREE := &"tree"

## Flat, like the interactor's: a trunk on a bank a little below is still in reach.
@export var reach := 4.5
## How far off straight ahead a target may sit, as a dot against the camera heading.
## Looser than the interactor's, because a trunk is wide and the player is aiming
## at a thing rather than choosing between two people standing together.
@export var facing := 0.2
## Seconds one swing takes end to end. Also what the animation is given to play in.
## Online this is presentation only -- the host's `chop_seconds` is what actually
## decides when a stage falls -- so the two want to agree or the axe and the tree
## drift out of step.
@export var swing_interval := 0.75
## Where in that window the blow actually connects, as a fraction. The rest is
## wind-up before and follow-through after, and the wind-up is what the host's
## answer arrives during.
@export var contact := 0.55
## Damage per swing, offline only. Online the host counts, and how much a swing is
## worth was never something to send it.
@export var hits := 1
## Seconds between target searches, which is what the reticle follows.
@export var aim_interval := 0.1

@export var stone_field_path: NodePath
@export var tree_field_path: NodePath

var _body: Node3D
var _stones: Node
var _trees: Node
var _net: NetGameClient
var _aim_kind: StringName = &""
var _aim_id := 0
var _aim_t := 0.0

## The swing in flight. Locked at the start rather than read at the end, so turning
## away mid-swing does not redirect the blow onto whatever is now in front.
var _target := {}
var _swing_t := 0.0
var _landed := false
## A stage the host granted before the arm got there. Held back rather than shown,
## or a nearby server reads as the tree breaking a beat before it is hit.
var _held_stage := -1
## What the host has been told we are working, as the id, or 0 for nothing. Tracked
## apart from the swing because a job outlives the swings that make it up: telling
## the host again every swing would be the per-swing message this replaced.
var _job_id := 0


func _ready() -> void:
	add_to_group(GROUP)
	_body = get_parent() as Node3D


## Resolved lazily rather than in _ready: the fields build their scatter off a
## world that is generated on another thread, and the player is in the tree well
## before any of it exists.
func _resolve() -> void:
	## Falls back to the player's own parent, because a player staged on its own -- under
	## the test runner, or before the world scene is current -- has no current_scene to
	## look the fields up in.
	var world: Node = get_tree().current_scene if get_tree() else null
	if world == null:
		world = _body.get_parent() if _body else null
	if _stones == null or not is_instance_valid(_stones):
		_stones = get_node_or_null(stone_field_path)
		if _stones == null and world:
			_stones = world.get_node_or_null(^"StoneField")
	if _trees == null or not is_instance_valid(_trees):
		_trees = get_node_or_null(tree_field_path)
		if _trees == null and world:
			_trees = world.get_node_or_null(^"TreeField")
	if _net == null or not is_instance_valid(_net):
		for node in get_tree().get_nodes_in_group(NetGameClient.GROUP):
			_net = node as NetGameClient
			if _net and not _net.harvest_applied.is_connected(_on_harvest_applied):
				_net.harvest_applied.connect(_on_harvest_applied)
				_net.harvest_rewarded.connect(_on_harvest_rewarded)
			break


## The host's word, for anybody's swing. Applied here rather than in the swing
## because a delta arrives for every player in the session, and the local one is
## not special: this client asked, it did not decide.
##
## Held only when it answers the swing this player is halfway through. Everybody
## else's lands the moment it arrives -- their timing is their business, and
## queueing their trees behind our arm would stall the world on our animation.
func _on_harvest_applied(target: StringName, id: int, stage: int) -> void:
	if _swinging() and not _landed and target == _target.get("kind") \
			and id == _target.get("id"):
		_held_stage = stage
		return
	# Deliberately no `harvested` here. The delta says the world changed, not who
	# earned anything by it, and it arrives for every player in the session -- so
	# awarding on it would pay this player for everybody else's work. Who gets the
	# drop is the host's to say, and it says it on `harvest_rewarded`.
	_apply_stage(target, id, stage)


## The host paying us. Only ever about this player, so unlike the delta above it can
## be banked without asking whose work it was.
func _on_harvest_rewarded(target: StringName, _id: int, ore: StringName, amount: int) -> void:
	_receive(target, ore, amount)


func _apply_stage(target: StringName, id: int, stage: int) -> void:
	var field = _trees if target == TREE else _stones
	if field and field.has_method("set_stage"):
		field.set_stage(id, stage)


func _swinging() -> bool:
	return not _target.is_empty()


## How far into the wind-up the arm is, as 0 at rest rising to 1 at the blow and
## falling back through the follow-through. What a reticle draws tension from.
func swing_tension() -> float:
	if not _swinging():
		return 0.0
	var t := _swing_t / maxf(swing_interval, 0.001)
	var peak: float = clampf(contact, 0.05, 0.95)
	return t / peak if t < peak else maxf(1.0 - (t - peak) / (1.0 - peak), 0.0)


func _process(delta: float) -> void:
	# Not only on input: deltas arrive for other players' swings too, and a client
	# that never harvested anything itself still has to show their rocks breaking.
	if _stones == null or _trees == null or _net == null:
		_resolve()

	if _swinging():
		_step(delta)
	# Not an elif: a swing that just ran out is followed on the same frame rather
	# than the next, so an axe still being held never puts itself down between blows.
	if not _swinging() and Input.is_action_pressed(&"harvest"):
		# Polled rather than taken on the press, because holding is the whole point:
		# a tree is several swings and the player should not have to count them out.
		_begin()
	elif not _swinging():
		# Nothing in flight and nothing asked for, so whatever the host thinks we
		# are working, we are not.
		_end_job()

	# Not every frame: the search walks both scatters and builds a dictionary per
	# candidate, which is far too much to spend on a mark that only has to keep up
	# with a walking player.
	_aim_t -= delta
	if _aim_t <= 0.0:
		_aim_t = aim_interval
		_publish_aim()


## Tells anybody drawing a reticle what the next swing would hit.
##
## Aimed at the same thing the swing would take, by asking the same question, so
## the mark cannot promise a target the swing then misses. Mid-swing it reports
## what is already committed instead of searching again, which both saves the walk
## and keeps the mark on the trunk being hit rather than sliding off it.
func _publish_aim() -> void:
	var target := _target if _swinging() else _nearest()
	var kind: StringName = target.get("kind", &"")
	var id: int = target.get("id", 0)
	if kind == _aim_kind and id == _aim_id:
		return
	_aim_kind = kind
	_aim_id = id
	aimed.emit(kind, target.get("info", {}))


## Held is polled rather than consumed through _unhandled_input, so a click the UI
## already answered has to be turned away here instead: harvest is on the left
## button, and a player pressing a HUD button should not also be swinging an axe.
func _can_swing() -> bool:
	if _body == null or get_viewport().gui_get_hovered_control() != null:
		return false
	return not (_body.has_method("is_talking") and _body.is_talking())


func _begin() -> void:
	if not _can_swing():
		_end_job()
		return
	_resolve()
	var target := _nearest()
	if target.is_empty():
		_end_job()
		return
	_target = target
	_swing_t = 0.0
	_landed = false
	_held_stage = -1

	var kind: StringName = target["kind"]
	var id: int = target["id"]
	_play_swing(kind)
	swung.emit(kind, id)

	# Told once, when the job starts or moves to something else. Every swing after
	# that is ours to draw and the host's to rule on, and it is already doing so.
	if _net and _net.is_joined() and _job_id != id:
		_end_job()
		var info: Dictionary = target["info"]
		_net.harvest_begin(kind, info.get("cell", Vector2i.ZERO), info.get("ordinal", 0))
		_job_id = id


## Puts down whatever the host thinks we are working. Safe to call when there is
## nothing to put down, which is what lets every path out of a swing end with it.
func _end_job() -> void:
	if _job_id == 0:
		return
	_job_id = 0
	if _net and _net.is_joined():
		_net.harvest_end()


func _step(delta: float) -> void:
	_swing_t += delta
	if not _landed and _swing_t >= swing_interval * clampf(contact, 0.05, 0.95):
		_landed = true
		_land()
	if _swing_t >= swing_interval:
		_target = {}


## The blow connecting. Offline that is when the damage is dealt, since nothing
## else was ever going to decide it; online the host is working to its own clock
## and this is only where an answer that arrived early is allowed on screen.
func _land() -> void:
	var kind: StringName = _target["kind"]
	var id: int = _target["id"]
	# Struck here rather than at the start of the swing. The arc is the blow, and
	# showing it while the arm is still going up puts the effect before its cause.
	var arc := _body.get_node_or_null(^"SlashArc")
	if arc and arc.has_method("slash"):
		arc.slash()
	if _net and _net.is_joined():
		if _held_stage >= 0:
			_apply_stage(kind, id, _held_stage)
			_held_stage = -1
		return
	var field = _target["field"]
	if field == null or not is_instance_valid(field):
		return
	var out: Dictionary = field.apply_damage(id, hits)
	if out.get("broken", false):
		_receive(kind, StringName(out.get("ore", "")), int(out.get("amount", 0)))


## Banks a drop, however it was earned.
##
## One path for both, because the difference between offline and online is only who
## decided -- by here the answer is the same shape and the satchel should not have to
## know which it was.
func _receive(kind: StringName, ore: StringName, amount: int) -> void:
	if ore == &"" or amount <= 0:
		return
	# Whatever would not fit falls at the player's feet rather than being silently gone.
	# `Journal.refused` says so on screen; this is what makes the saying true.
	var spare := Journal.gain(ore, amount)
	if spare > 0 and _body != null:
		var ground := GroundItems.of(get_tree())
		if ground != null:
			ground.drop(ore, spare, _body.global_position)
	harvested.emit(kind, ore, amount - spare)


## Nearest rock or tree in reach and roughly ahead, as everything the swing needs
## to act on it. Empty when there is nothing to hit.
func _nearest() -> Dictionary:
	if _body == null:
		return {}
	var ahead := -_look_basis().z
	ahead.y = 0.0
	ahead = ahead.normalized()
	var here := _body.global_position
	var best := {}
	var best_gap := INF
	for pair in [[STONE, _stones], [TREE, _trees]]:
		var kind: StringName = pair[0]
		var field = pair[1]
		if field == null or not field.has_method("query_radius"):
			continue
		for id in field.query_radius(here, reach, 8):
			var info: Dictionary = field.get_info(id)
			if info.is_empty() or not info.get("alive", false):
				continue
			var to: Vector3 = info["position"] - here
			to.y = 0.0
			var gap := to.length()
			if gap < 0.001 or gap > reach:
				continue
			if ahead.dot(to / gap) < facing:
				continue
			if gap < best_gap:
				best_gap = gap
				best = {"kind": kind, "field": field, "id": id, "info": info}
	return best


## Optional: the swing is worth doing without a rig to show it.
func _play_swing(kind: StringName) -> void:
	var mesh := _body.get_node_or_null(^"Mesh")
	if mesh and mesh.has_method("play_action"):
		mesh.play_action(&"chop" if kind == TREE else &"mine", swing_interval)


func _look_basis() -> Basis:
	var camera := get_viewport().get_camera_3d()
	return camera.global_basis if camera else _body.global_basis
