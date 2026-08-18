extends Node3D

## Puts people in the built places while the player is near enough to meet them.
##
## The landmarks themselves stream: a capital is derived from the seed and raised when
## the baked window reaches it, and taken down again when it does not. Its people have
## to come and go with it, or a city the player has walked away from is a city still
## paying for four rigs, four animation trees and four conversations nobody can reach.
##
## Where anybody stands is not decided here. [QTerrain.landmark_posts] answers that from
## the same derivation that put the walls up, so a guard is at the gateway of whichever
## capital this is rather than at coordinates that only happen to be a gateway in one of
## them. This picks a body for the role and keeps the roster in step.

const GROUP := &"landmark_folk"

@export var terrain_path: NodePath = ^"../Terrain"

## One scene per role, authored in the editor. A role with nothing behind it is left
## unfilled rather than filled with a placeholder -- an untextured capsule standing at
## a gate reads as a bug, and an empty gate reads as a gate.
@export_group("Bodies")
@export var gate_guard: PackedScene
@export var trader: PackedScene
@export var steward: PackedScene
@export var dockhand: PackedScene
@export var harbourmaster: PackedScene

@export_group("Placing")
## How often the roster is reconsidered. A window shift is seconds apart at a walk, and
## every pass walks the posts.
@export var settle_interval := 0.75
@export var debug := false

var _terrain: Node
var _wait := 0.0
var _folk: Dictionary = {}


func _ready() -> void:
	add_to_group(GROUP)
	_terrain = get_node_or_null(terrain_path)
	if _terrain != null:
		return
	# There is no current scene under a test runner, and reaching through a null one to
	# look for the terrain takes the whole engine down rather than leaving the roster
	# empty, which is what having no terrain should mean.
	var scene := get_tree().current_scene if is_inside_tree() else null
	if scene != null:
		_terrain = scene.get_node_or_null(^"Terrain")


func _process(delta: float) -> void:
	if _terrain == null or not _terrain.has_method("landmark_posts"):
		return
	_wait -= delta
	if _wait > 0.0:
		return
	_wait = settle_interval
	_settle()


## Brings the roster in line with the posts the world currently has.
func _settle() -> void:
	var posts: Array = _terrain.landmark_posts()
	var wanted := {}
	for post: Dictionary in posts:
		wanted[_key(post)] = post

	for key: String in _folk.keys():
		if wanted.has(key):
			continue
		var who: Node = _folk[key]
		_folk.erase(key)
		if is_instance_valid(who):
			who.queue_free()

	for key: String in wanted:
		if _folk.has(key):
			continue
		var who := _raise(wanted[key])
		if who != null:
			_folk[key] = who

	if debug:
		print("landmark_folk: %d posts, %d standing" % [posts.size(), _folk.size()])


## A post's name in the world, which has to survive the window moving over it.
##
## Keyed by which landmark and which post rather than by where it is: the same guard is
## the same guard whichever window found them, and keying on position would take them
## down and stand a new one up every time the ground under them was re-baked.
func _key(post: Dictionary) -> String:
	var cell: Vector2i = post["cell"]
	return "%s/%d/%d/%s/%s" % [
		post["landmark"], cell.x, cell.y, post["role"], post["at"],
	]


func _raise(post: Dictionary) -> Node3D:
	var scene: PackedScene = _body_for(post["role"])
	if scene == null:
		return null
	var who := scene.instantiate() as Node3D
	if who == null:
		return null
	# Added before the position is set, because the actor settles itself onto the ground
	# and lays its route out of where it is standing when it enters the tree.
	add_child(who)
	var at: Vector3 = post["at"]
	who.global_position = at
	var facing: Vector3 = post["facing"]
	if facing.distance_to(at) > 0.1:
		who.look_at(Vector3(facing.x, at.y, facing.z), Vector3.UP)
	return who


func _body_for(role: String) -> PackedScene:
	match role:
		"gate_guard":
			return gate_guard
		"trader":
			return trader
		"steward":
			return steward
		"dockhand":
			return dockhand
		"harbourmaster":
			return harbourmaster
	return null
