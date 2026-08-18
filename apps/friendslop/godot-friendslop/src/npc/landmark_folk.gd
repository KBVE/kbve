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
var _warming: Array[String] = []
var _warm: Array[Resource] = []


func _ready() -> void:
	add_to_group(GROUP)
	_warm_the_wardrobe()
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
	_collect_warm()
	if _terrain == null or not _terrain.has_method("landmark_posts"):
		return
	_wait -= delta
	if _wait > 0.0:
		return
	_wait = 0.0 if _settle() else settle_interval


## Brings the roster in line with the posts the world currently has, one arrival at a
## time. Returns whether anybody is still waiting to be stood up.
##
## Building a body is tens of milliseconds -- a rig, its wardrobe and an animation tree --
## so raising a capital's whole roster in the pass that first sees it is a hitch the player
## walks into every time they approach one. Only one person arrives per pass, and a pass
## with a queue behind it comes back on the next frame rather than the next interval, so
## the place still fills up promptly while no single frame pays for more than one of them.
func _settle() -> bool:
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

	var waiting := 0
	for key: String in wanted:
		if _folk.has(key):
			continue
		waiting += 1
		if waiting > 1:
			continue
		var who := _raise(wanted[key])
		if who == null:
			# Nothing will ever stand here -- no body is authored for the role -- so it
			# is not a backlog and must not hold the pass on the next frame forever.
			waiting -= 1
			continue
		_folk[key] = who

	if debug:
		print("landmark_folk: %d posts, %d standing, %d waiting" % [
			posts.size(), _folk.size(), maxi(waiting - 1, 0),
		])
	return waiting > 1


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


## Asks for every garment these people will wear, off the main thread, long before any of
## them is stood up.
##
## A rig loads its wardrobe when it enters the tree -- one blocking [method @GDScript.load]
## per worn piece, four heavy meshes a body. The loads are cached, so only the first of a
## kind costs anything, but the first of a kind is exactly the one the player is walking
## towards when it happens. Requesting them at boot moves that cost onto a loader thread
## during the minutes of walking it takes to reach anywhere built.
##
## The results are kept, not just requested: a resource nobody holds a reference to is free
## to leave the cache again, and then the rig pays for it after all.
func _warm_the_wardrobe() -> void:
	for scene: PackedScene in [gate_guard, trader, steward, dockhand, harbourmaster]:
		for id: StringName in _worn_by(scene):
			var path := Wardrobe.path_of(id)
			if path.is_empty() or _warming.has(path):
				continue
			if ResourceLoader.load_threaded_request(path) == OK:
				_warming.append(path)


## What a role wears, read off the packed scene rather than out of an instance of it,
## because instantiating one to find out is the cost this is trying to avoid.
func _worn_by(scene: PackedScene) -> Array:
	if scene == null:
		return []
	var state := scene.get_state()
	for node in state.get_node_count():
		for prop in state.get_node_property_count(node):
			if state.get_node_property_name(node, prop) == &"worn":
				return state.get_node_property_value(node, prop)
	return []


## Takes delivery of whatever the loader threads have finished, and stops looking once
## the last one is in.
func _collect_warm() -> void:
	if _warming.is_empty():
		return
	var still: Array[String] = []
	for path in _warming:
		match ResourceLoader.load_threaded_get_status(path):
			ResourceLoader.THREAD_LOAD_IN_PROGRESS:
				still.append(path)
			ResourceLoader.THREAD_LOAD_LOADED:
				_warm.append(ResourceLoader.load_threaded_get(path))
	_warming = still
