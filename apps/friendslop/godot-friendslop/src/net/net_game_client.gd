class_name NetGameClient
extends Node3D

## Renders a remote authoritative session.

signal joined(seed_value: int, player_name: String)
signal rejected(reason: String)
signal avatar_spawned(body_id: int, node: Node3D)
signal roster_changed()
signal pet_spawned(body_id: int, node: Node3D)
signal pets_changed()
## A deploy the server turned down, with wording to show the player.
signal pet_denied(reason: String)
## The host's word on a rock or tree reaching a stage, for anybody's swing rather
## than only this player's.
signal harvest_applied(target: StringName, id: int, stage: int)
## What the host paid *us* for finishing something off. Distinct from the delta above,
## which arrives for everybody's work: this one only ever concerns this player, and is
## the only thing that says a drop is ours.
signal harvest_rewarded(target: StringName, id: int, ore: StringName, amount: int)

const GROUP := &"net_game_client"

## Matches q's HarvestTarget, which is what the wire carries.
const TARGET_STONE := 0
const TARGET_TREE := 1

## The deployed fleet.
const DEPLOYED_URL := "wss://friendslop.kbve.com/ws"

@export var server_url := "ws://127.0.0.1:7980/ws"
@export var tick_hz := 60.0
@export var autoconnect := false
@export var avatar_scene: PackedScene

## Node whose Y rotation movement intent is expressed relative to — the camera, in
## practice.
@export var intent_basis_path: NodePath

## Vestigial: guests are named by the server, and a name asked for is a name that could
## be someone else's.
@export var player_name := ""

## Supabase access token.
@export var access_token := ""

var _client := QNetClient3D.new()

var _avatars: Dictionary[int, Node3D] = {}
var _pets: Dictionary[int, Node3D] = {}


func _ready() -> void:
	add_to_group(GROUP)
	if _client.get_parent() == null:
		add_child(_client)
	if autoconnect:
		connect_to_server()


func _init() -> void:
	_client.autoconnect = false
	_client.joined.connect(_on_joined)
	_client.rejected.connect(_on_rejected)
	_client.body_added.connect(_on_body_added)
	_client.body_removed.connect(_on_body_removed)
	_client.roster_changed.connect(_on_roster_changed)
	_client.pet_added.connect(_on_pet_added)
	_client.pet_removed.connect(_on_pet_removed)
	_client.pets_changed.connect(_on_pets_changed)
	_client.pet_denied.connect(_on_pet_denied)
	_client.harvest_applied.connect(_on_harvest_applied)
	_client.harvest_rewarded.connect(_on_harvest_rewarded)


func connect_to_server(url: String = "") -> void:
	if url != "":
		server_url = url
	_client.server_url = server_url
	_client.tick_hz = tick_hz
	_client.player_name = player_name
	_client.access_token = access_token
	if _client.get_parent() == null and is_inside_tree():
		add_child(_client)
	_client.connect_to_server()


func disconnect_from_server() -> void:
	for node in _avatars.values():
		node.queue_free()
	_avatars.clear()
	for node in _pets.values():
		node.queue_free()
	_pets.clear()
	_client.disconnect_from_server()


func is_joined() -> bool:
	return _client.is_joined()


## Tells the host we have started working a rock or tree, and will keep at it.
##
## Sent once at the top of the job rather than once per swing. The host times the
## stages from here, so it decides how fast anyone chops and its rulings arrive
## while the client is already looping its animation.
##
## The cell and ordinal go over rather than the resolved id, so the host derives
## the id itself: a client that could name an id could name any id, including one
## on the far side of the map.
func harvest_begin(kind: StringName, cell: Vector2i, ordinal: int) -> void:
	if not is_joined():
		return
	if kind == &"tree":
		_client.harvest_tree(cell.x, cell.y, ordinal)
	else:
		_client.harvest_stone(cell.x, cell.y, ordinal)


## Tells the host we have stopped. Walking away ends the job on its own, but this
## is what makes letting go of the button stop it on the same tick.
func harvest_end() -> void:
	if is_joined():
		_client.harvest_stop()


func _on_harvest_applied(target: int, id: int, stage: int) -> void:
	harvest_applied.emit(
			&"tree" if target == TARGET_TREE else &"stone", id, stage)


func _on_harvest_rewarded(target: int, id: int, ore: String, amount: int) -> void:
	harvest_rewarded.emit(
			&"tree" if target == TARGET_TREE else &"stone", id, StringName(ore), amount)


func local_body() -> int:
	return _client.local_body()


func local_avatar() -> Node3D:
	return _avatars.get(_client.local_body())


## Name the server gave us.
func local_name() -> String:
	return _client.local_name()


## Name of whoever owns body_id, or "" for a body with no player behind it.
func body_name(body_id: int) -> String:
	return _client.body_name(body_id)


## Every player as { body_id: name }, in roster order.
func roster() -> Dictionary[int, String]:
	var out: Dictionary[int, String] = {}
	var bodies := _client.roster_bodies()
	var names := _client.roster_names()
	for i in mini(bodies.size(), names.size()):
		out[bodies[i]] = names[i]
	return out


func world_seed() -> int:
	return _client.world_seed()


## Half-width of the ground the host simulates, 0 before joining.
func world_extent() -> float:
	return _client.world_extent()


func world_resolution() -> int:
	return _client.world_resolution()


func last_error() -> String:
	return _client.last_error()


func snapshot_tick() -> int:
	return _client.snapshot_tick()


func _process(_delta: float) -> void:
	if not _client.is_joined():
		return
	var wish := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	_client.set_intent(_world_wish(wish), Input.is_action_pressed("jump"), _facing())


## Where we are looking, in world terms. The server has no other way to know, and
## anything it decides on our behalf needs it.
func _facing() -> float:
	if intent_basis_path.is_empty():
		return 0.0
	var basis_node := get_node_or_null(intent_basis_path) as Node3D
	return basis_node.global_rotation.y if basis_node else 0.0


## Host clock in hours, 0..24. Zero until the first Welcome.
func world_hour() -> float:
	return _client.world_hour()


## Seconds the host has simulated, never wrapped. The hour says what the sky looks like;
## this is what anything scheduled against world time has to read.
func world_elapsed() -> float:
	return _client.world_elapsed()


## Whole days the world has run.
func world_day() -> int:
	return _client.world_day()


## The hour the host's day began at.
func world_start_hour() -> float:
	return _client.world_start_hour()


## Real-world minutes the host's day takes, or 0 before joining.
func day_length_minutes() -> float:
	return _client.day_length_minutes()


## Terrain the host is simulating. Authoritative: baking a different extent or
## resolution means disagreeing about ground height, which reads as players sinking
## into or hovering over it rather than as any kind of error.
func terrain_extent() -> float:
	return _client.terrain_extent()


func terrain_resolution() -> int:
	return _client.terrain_resolution()


## The two numbers the bridge deck's height is derived from. Same story as the extent:
## disagree and the client draws planks over what its own server holds as river.
func world_water_level() -> float:
	return _client.world_water_level()


func world_road_width() -> float:
	return _client.world_road_width()


## Input is in screen terms — left is left of the camera, not west.
func _world_wish(wish: Vector2) -> Vector2:
	if wish == Vector2.ZERO or intent_basis_path.is_empty():
		return wish
	var basis_node := get_node_or_null(intent_basis_path) as Node3D
	if basis_node == null:
		return wish
	return wish.rotated(-basis_node.global_rotation.y)


func _on_joined(seed_value: int, assigned_name: String) -> void:
	joined.emit(seed_value, assigned_name)


func _on_roster_changed() -> void:
	roster_changed.emit()


func _on_rejected(reason: String) -> void:
	rejected.emit(reason)


func _on_body_added(body_id: int) -> void:
	if _avatars.has(body_id):
		return
	var node := _make_avatar()
	node.name = "Body%d" % body_id
	add_child(node)
	_avatars[body_id] = node
	_client.track(body_id, node)
	avatar_spawned.emit(body_id, node)


func _on_body_removed(body_id: int) -> void:
	var node: Node3D = _avatars.get(body_id)
	if node:
		_avatars.erase(body_id)
		node.queue_free()


## Asks the server to put a robot down beside us. Only the chassis is ours to
## choose: where it lands, what id it gets and whether we may have it at all are
## the server's, and it answers a refusal on `pet_denied`.
func deploy_pet(kind: int = 0) -> void:
	_client.deploy_pet(kind)


## Picks up the pet drawn under `body_id`, if it is ours.
func recall_pet(body_id: int) -> void:
	var pet_id: int = _client.pet_id_of(body_id)
	if pet_id >= 0:
		_client.recall_pet(pet_id)


func recall_all_pets() -> void:
	_client.recall_pets()


## Body ids of the robots we have out, which is what a recall menu lists.
func my_pet_bodies() -> PackedInt64Array:
	return _client.my_pet_bodies()


func pet_count() -> int:
	return _pets.size()


func _on_pet_added(body_id: int) -> void:
	if _pets.has(body_id):
		return
	var node := NetPet.new()
	node.name = "Pet%d" % body_id
	node.build(_client.pet_kind_of(body_id), "")
	add_child(node)
	_pets[body_id] = node
	_client.track(body_id, node)
	pet_spawned.emit(body_id, node)


func _on_pet_removed(body_id: int) -> void:
	var node: Node3D = _pets.get(body_id)
	if node:
		_pets.erase(body_id)
		node.queue_free()


## The pet list is reliable and the bodies are not, so a robot can be on screen for
## a frame or two before there is anything to say whose it is or what to draw. The
## chassis is filled in here once it arrives.
func _on_pets_changed() -> void:
	for body_id in _pets:
		var node: NetPet = _pets[body_id]
		if node == null:
			continue
		node.build(_client.pet_kind_of(body_id), "")
		node.set_display_name(_client.body_name(_client.pet_owner_body(body_id)))
	pets_changed.emit()


func _on_pet_denied(reason: String) -> void:
	pet_denied.emit(reason)


func _make_avatar() -> Node3D:
	if avatar_scene:
		return avatar_scene.instantiate() as Node3D
	var node := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.4
	capsule.height = 1.8
	node.mesh = capsule
	return node
