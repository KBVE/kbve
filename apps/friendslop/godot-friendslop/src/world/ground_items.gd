class_name GroundItems
extends Node3D


const GROUP := &"ground_items"

@export var pickup_radius := 1.9
@export var despawn_seconds := 420.0
@export var retry_seconds := 1.5
@export var max_items := 48
@export var player_path: NodePath

var _player: Node3D
var _items: Array[GroundItem] = []
var _phase := 0.0


func _ready() -> void:
	add_to_group(GROUP)
	if player_path != NodePath():
		_player = get_node_or_null(player_path) as Node3D


static func of(tree: SceneTree) -> GroundItems:
	if tree == null:
		return null
	return tree.get_first_node_in_group(GROUP) as GroundItems


func drop(ref: StringName, count: int, at: Vector3, armed := true) -> GroundItem:
	if count <= 0 or not Itemdb.has(ref):
		return null
	while _items.size() >= max_items:
		_forget(_items[0])
	_phase += 1.31
	var item := GroundItem.new()
	item.name = "Drop_%s_%d" % [ref, _items.size()]
	item.position = to_local(at + Vector3(cos(_phase) * 0.45, 0.0, sin(_phase) * 0.45))
	add_child(item)
	item.setup(ref, count, _phase)
	item.armed = armed
	_items.append(item)
	return item


func drop_at_player(ref: StringName, count: int) -> GroundItem:
	var at := global_position
	if _player != null and _player.is_inside_tree():
		at = _player.global_position
	return drop(ref, count, at, false)


func items() -> Array[GroundItem]:
	return _items.duplicate()


func _process(delta: float) -> void:
	if _items.is_empty():
		return
	var here := Vector3.ZERO
	var has_player := _player != null and _player.is_inside_tree()
	if has_player:
		here = _player.global_position
	for i in range(_items.size() - 1, -1, -1):
		var item := _items[i]
		item.advance(delta)
		if item.age >= despawn_seconds:
			_forget(item)
			continue
		if not has_player:
			continue
		var near := _within(item, here)
		if not item.armed:
			if not near:
				item.armed = true
			continue
		if item.retry_in <= 0.0 and near:
			_try_pickup(item)


func _within(item: GroundItem, here: Vector3) -> bool:
	var gap := item.global_position - here
	gap.y = 0.0
	return gap.length_squared() <= pickup_radius * pickup_radius


func _try_pickup(item: GroundItem) -> void:
	var spare := Journal.gain(item.ref, item.count)
	if spare >= item.count:
		item.retry_in = retry_seconds
		return
	if item.take(item.count - spare):
		_forget(item)


func _forget(item: GroundItem) -> void:
	_items.erase(item)
	item.queue_free()
