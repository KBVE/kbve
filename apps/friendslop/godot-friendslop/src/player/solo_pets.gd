extends Node3D

## Summons the player's robots in solo, out of the same roster the host runs online.
##
## The registry in `q/src/net/pets.rs` never touches the world it drives -- it reads the
## published state and emits three commands, to stand a robot up, take one away and move
## one. That is what lets it run on either side of the wire: online the host owns it and
## the client draws what arrives, and here it runs against the player's own simulation.
##
## So this is deliberately thin. It presses the same buttons, puts the same chassis on
## what comes back, and lets the physics node carry the transforms. What a robot does
## once it is standing is not decided here, in solo any more than online.

const NetPetScene := preload("res://src/net/net_pet.gd")

@export var physics_path: NodePath = ^"../Physics"

var _physics: Node
var _standing: Dictionary[int, Node3D] = {}


func _ready() -> void:
	_physics = get_node_or_null(physics_path)
	if _physics == null or not _physics.has_method(&"deploy_pet"):
		_physics = null


func _unhandled_input(event: InputEvent) -> void:
	if _physics == null:
		return
	if event.is_action_pressed(&"deploy_pet"):
		_physics.deploy_pet(_standing.size() % NetPetScene.CHASSIS.size())
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed(&"recall_pets"):
		_physics.recall_all_pets()
		get_viewport().set_input_as_handled()


func _process(_delta: float) -> void:
	if _physics == null:
		return
	_settle()


## Brings the chassis on the ground in line with the roster.
##
## Read back from the roster rather than remembered from the summon, because the roster
## is what decides: a summon can be refused for the per-player cap, and a robot can be
## dropped for falling out of the world. Anything that tracked its own list would show a
## robot that is no longer there.
func _settle() -> void:
	var pairs: PackedInt64Array = _physics.pet_bodies()
	var wanted: Dictionary[int, int] = {}
	for i in range(0, pairs.size(), 2):
		wanted[int(pairs[i])] = int(pairs[i + 1])

	for pet_id: int in _standing.keys():
		if wanted.has(pet_id):
			continue
		var who: Node3D = _standing[pet_id]
		_standing.erase(pet_id)
		if is_instance_valid(who):
			who.queue_free()

	for pet_id: int in wanted:
		if _standing.has(pet_id):
			continue
		_raise(pet_id, wanted[pet_id])


func _raise(pet_id: int, body_id: int) -> void:
	var pet: Node3D = NetPetScene.new()
	add_child(pet)
	pet.build(pet_id % NetPetScene.CHASSIS.size(), "")
	pet.bind_body(_physics, body_id)
	# The physics node carries the transform from here, interpolated between published
	# poses like every other body it drives.
	_physics.follow_body(pet, body_id, _physics.pet_chassis_offset())
	_standing[pet_id] = pet
