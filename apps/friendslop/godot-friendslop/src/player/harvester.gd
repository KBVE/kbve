extends Node3D


signal swung(target: StringName, id: int)
signal harvested(target: StringName, ore: StringName, amount: int)
signal aimed(target: StringName, info: Dictionary)

const GROUP := &"harvester"
const STONE := &"stone"
const TREE := &"tree"

@export var reach := 4.5
@export var facing := 0.2
@export var swing_interval := 0.75
@export var contact := 0.55
@export var hits := 1
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

var _target := {}
var _swing_t := 0.0
var _landed := false
var _held_stage := -1
var _job_id := 0


func _ready() -> void:
	add_to_group(GROUP)
	_body = get_parent() as Node3D


func _resolve() -> void:
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
				# Whatever was felled before this tool existed, which includes the
				# whole ledger the host replays on join.
				_net.replay_harvest()
			break


func _on_harvest_applied(target: StringName, id: int, stage: int) -> void:
	if _swinging() and not _landed and target == _target.get("kind") \
			and id == _target.get("id"):
		_held_stage = stage
		return
	_apply_stage(target, id, stage)


func _on_harvest_rewarded(target: StringName, _id: int, ore: StringName, amount: int) -> void:
	_receive(target, ore, amount)


func _apply_stage(target: StringName, id: int, stage: int) -> void:
	var field = _trees if target == TREE else _stones
	if field and field.has_method("set_stage"):
		field.set_stage(id, stage)


func _swinging() -> bool:
	return not _target.is_empty()


func swing_tension() -> float:
	if not _swinging():
		return 0.0
	var t := _swing_t / maxf(swing_interval, 0.001)
	var peak: float = clampf(contact, 0.05, 0.95)
	return t / peak if t < peak else maxf(1.0 - (t - peak) / (1.0 - peak), 0.0)


func _process(delta: float) -> void:
	if _stones == null or _trees == null or _net == null:
		_resolve()

	if _swinging():
		_step(delta)
	if not _swinging() and Input.is_action_pressed(&"harvest"):
		_begin()
	elif not _swinging():
		_end_job()

	_aim_t -= delta
	if _aim_t <= 0.0:
		_aim_t = aim_interval
		_publish_aim()


func _publish_aim() -> void:
	var target := _target if _swinging() else _nearest()
	var kind: StringName = target.get("kind", &"")
	var id: int = target.get("id", 0)
	if kind == _aim_kind and id == _aim_id:
		return
	_aim_kind = kind
	_aim_id = id
	aimed.emit(kind, target.get("info", {}))


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

	if _net and _net.is_joined() and _job_id != id:
		_end_job()
		var info: Dictionary = target["info"]
		_net.harvest_begin(kind, info.get("cell", Vector2i.ZERO), info.get("ordinal", 0))
		_job_id = id


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


func _land() -> void:
	var kind: StringName = _target["kind"]
	var id: int = _target["id"]
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


func _receive(kind: StringName, ore: StringName, amount: int) -> void:
	if ore == &"" or amount <= 0:
		return
	var spare := Journal.gain(ore, amount)
	if spare > 0 and _body != null:
		var ground := GroundItems.of(get_tree())
		if ground != null:
			ground.drop(ore, spare, _body.global_position)
	harvested.emit(kind, ore, amount - spare)


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


func _play_swing(kind: StringName) -> void:
	var mesh := _body.get_node_or_null(^"Mesh")
	if mesh and mesh.has_method("play_action"):
		mesh.play_action(&"chop" if kind == TREE else &"mine", swing_interval)


func _look_basis() -> Basis:
	var camera := get_viewport().get_camera_3d()
	return camera.global_basis if camera else _body.global_basis
