class_name GroundItems
extends Node3D

## What is lying about on the ground, and picking it back up.
##
## A bag with a shape in it is a bag that can be full, and loot that meets a full bag has
## to go somewhere. It goes at the player's feet, which is the one place they are certain
## to be able to find it again, and it stays there until it is picked up or long enough
## has passed that it plainly is not going to be.
##
## Pickup is a distance check rather than an Area3D. Drops are few, the test is two
## subtractions, and a check the field runs itself is one that can be stepped in a
## headless test without a physics server having to agree.
##
## These are local, not networked. A drop only ever exists because *this* player's own bag
## refused it, so there is nobody else who could reasonably have a claim on it and nothing
## to arbitrate. When ground loot comes off a shared kill instead, that is the point at
## which it needs the host's opinion -- and a different thing from this.

const GROUP := &"ground_items"

## How close is close enough to pick something up. Generous: the drop bobs, the player is
## a capsule, and hunting for the exact spot is not the game.
@export var pickup_radius := 1.9
## Seconds a drop lies there before it is gone. Long enough to empty a bag at a chest and
## walk back; short enough that a morning's overflow is not still underfoot at dusk.
@export var despawn_seconds := 420.0
## Seconds before a drop a full bag could not take is tried again.
@export var retry_seconds := 1.5
## Past this the oldest goes, so a pathological run cannot fill a clearing without bound.
@export var max_items := 48
@export var player_path: NodePath

var _player: Node3D
var _items: Array[GroundItem] = []
## Turned by each drop, so a heap does not bob and spin as one body.
var _phase := 0.0


func _ready() -> void:
	add_to_group(GROUP)
	if player_path != NodePath():
		_player = get_node_or_null(player_path) as Node3D


## The field for this tree, for anything that has loot to shed and no reference to hand.
static func of(tree: SceneTree) -> GroundItems:
	if tree == null:
		return null
	return tree.get_first_node_in_group(GROUP) as GroundItems


## Puts a lot of something on the ground. Scattered a little, so felling two trees in the
## same spot does not stack two plates into one unreadable one.
func drop(ref: StringName, count: int, at: Vector3) -> GroundItem:
	if count <= 0 or not Itemdb.has(ref):
		return null
	while _items.size() >= max_items:
		_forget(_items[0])
	_phase += 1.31
	var item := GroundItem.new()
	item.name = "Drop_%s_%d" % [ref, _items.size()]
	# Placed before it enters the tree: the height it rests at is the height it is at when
	# it readies, and bobbing about a floor it was moved to afterwards is bobbing about
	# the wrong one.
	item.position = to_local(at + Vector3(cos(_phase) * 0.45, 0.0, sin(_phase) * 0.45))
	add_child(item)
	item.setup(ref, count, _phase)
	_items.append(item)
	return item


func items() -> Array[GroundItem]:
	return _items.duplicate()


func _process(delta: float) -> void:
	if _items.is_empty():
		return
	var here := Vector3.ZERO
	var has_player := _player != null and _player.is_inside_tree()
	if has_player:
		here = _player.global_position
	# Backwards, because taking one out is what most passes end in.
	for i in range(_items.size() - 1, -1, -1):
		var item := _items[i]
		item.advance(delta)
		if item.age >= despawn_seconds:
			_forget(item)
			continue
		if has_player and item.retry_in <= 0.0 and _within(item, here):
			_try_pickup(item)


func _within(item: GroundItem, here: Vector3) -> bool:
	var gap := item.global_position - here
	gap.y = 0.0
	return gap.length_squared() <= pickup_radius * pickup_radius


## Takes what fits and leaves the rest. A bag with room for two of the five on the ground
## should take the two, not refuse the lot -- and the three left behind stay a pile that
## still says three.
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
