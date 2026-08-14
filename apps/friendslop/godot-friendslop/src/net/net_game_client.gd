class_name NetGameClient
extends Node3D

## Renders a remote authoritative session.

signal joined(seed_value: int, player_name: String)
signal rejected(reason: String)
signal avatar_spawned(body_id: int, node: Node3D)
signal roster_changed()

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


func _ready() -> void:
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
	_client.disconnect_from_server()


func is_joined() -> bool:
	return _client.is_joined()


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


func _make_avatar() -> Node3D:
	if avatar_scene:
		return avatar_scene.instantiate() as Node3D
	var node := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.4
	capsule.height = 1.8
	node.mesh = capsule
	return node
