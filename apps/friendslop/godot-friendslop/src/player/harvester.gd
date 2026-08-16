extends Node3D

## Swings at whatever rock or tree the player is standing in front of.
##
## Hung off the player next to the interactor, and aims the same way it does, so
## the two agree about what counts as "in front of me" and only differ in what
## they are looking for.
##
## Offline the field is damaged directly. Online the request goes to the server
## and the field is left alone: the host owns the ledger, and a client that
## damaged its own copy would show a rock breaking that the server never agreed
## to and then have to take it back.

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
## Seconds between swings. Also what the animation is given to play in.
@export var swing_interval := 0.75
## Damage per swing, which the host clamps to the stage count anyway.
@export var hits := 1
## Seconds between target searches, which is what the reticle follows.
@export var aim_interval := 0.1

@export var stone_field_path: NodePath
@export var tree_field_path: NodePath

var _body: Node3D
var _stones: Node
var _trees: Node
var _net: NetGameClient
var _cooldown := 0.0
var _aim_kind: StringName = &""
var _aim_id := 0
var _aim_t := 0.0


func _ready() -> void:
	add_to_group(GROUP)
	_body = get_parent() as Node3D


## Resolved lazily rather than in _ready: the fields build their scatter off a
## world that is generated on another thread, and the player is in the tree well
## before any of it exists.
func _resolve() -> void:
	if _stones == null or not is_instance_valid(_stones):
		_stones = get_node_or_null(stone_field_path)
		if _stones == null:
			_stones = get_tree().current_scene.get_node_or_null(^"StoneField")
	if _trees == null or not is_instance_valid(_trees):
		_trees = get_node_or_null(tree_field_path)
		if _trees == null:
			_trees = get_tree().current_scene.get_node_or_null(^"TreeField")
	if _net == null or not is_instance_valid(_net):
		for node in get_tree().get_nodes_in_group(NetGameClient.GROUP):
			_net = node as NetGameClient
			if _net and not _net.harvest_applied.is_connected(_on_harvest_applied):
				_net.harvest_applied.connect(_on_harvest_applied)
			break


## The host's word, for anybody's swing. Applied here rather than in the swing
## because a delta arrives for every player in the session, and the local one is
## not special: this client asked, it did not decide.
func _on_harvest_applied(target: StringName, id: int, stage: int) -> void:
	var field = _trees if target == TREE else _stones
	if field == null or not field.has_method("set_stage"):
		return
	# Deliberately no `harvested` here. The delta says the world changed, not who
	# earned anything by it, and it arrives for every player in the session -- so
	# awarding on it would pay this player for everybody else's work. Who gets the
	# drop is the server's to say, and it has no way to say it yet.
	field.set_stage(id, stage)


func _process(delta: float) -> void:
	_cooldown = maxf(_cooldown - delta, 0.0)
	# Not only on input: deltas arrive for other players' swings too, and a client
	# that never harvested anything itself still has to show their rocks breaking.
	if _stones == null or _trees == null or _net == null:
		_resolve()
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
## the mark cannot promise a target the swing then misses.
func _publish_aim() -> void:
	var target := _nearest()
	var kind: StringName = target.get("kind", &"")
	var id: int = target.get("id", 0)
	if kind == _aim_kind and id == _aim_id:
		return
	_aim_kind = kind
	_aim_id = id
	aimed.emit(kind, target.get("info", {}))


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed(&"harvest") or _cooldown > 0.0:
		return
	if _body == null:
		return
	if _body.has_method("is_talking") and _body.is_talking():
		return
	_resolve()
	var target := _nearest()
	if target.is_empty():
		return
	get_viewport().set_input_as_handled()
	_cooldown = swing_interval
	_swing(target)


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


func _swing(target: Dictionary) -> void:
	var kind: StringName = target["kind"]
	var id: int = target["id"]
	_play_swing(kind)
	swung.emit(kind, id)

	if _net and _net.is_joined():
		var info: Dictionary = target["info"]
		var cell: Vector2i = info.get("cell", Vector2i.ZERO)
		var ordinal: int = info.get("ordinal", 0)
		_net.harvest(kind, cell, ordinal, hits)
		return

	# Offline the swing is authoritative, so the reward is known here and now.
	var out: Dictionary = target["field"].apply_damage(id, hits)
	if out.get("broken", false):
		harvested.emit(kind, StringName(out.get("ore", "")), int(out.get("amount", 0)))


## The arc and the animation, both optional: this is worth doing without either.
func _play_swing(kind: StringName) -> void:
	var arc := _body.get_node_or_null(^"SlashArc")
	if arc and arc.has_method("slash"):
		arc.slash()
	var mesh := _body.get_node_or_null(^"Mesh")
	if mesh and mesh.has_method("play_action"):
		mesh.play_action(&"chop" if kind == TREE else &"mine", swing_interval)


func _look_basis() -> Basis:
	var camera := get_viewport().get_camera_3d()
	return camera.global_basis if camera else _body.global_basis
