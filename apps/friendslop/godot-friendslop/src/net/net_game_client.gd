class_name NetGameClient
extends Node3D

## Renders a remote authoritative session.
##
## Bodies are authored by the server, so this node reacts to body_added /
## body_removed rather than spawning into a sim it does not own. Movement is
## never applied locally: input is sent as intent and the server decides what
## it means.

signal joined(seed_value: int, player_name: String)
signal rejected(reason: String)
signal avatar_spawned(body_id: int, node: Node3D)
signal roster_changed()

## The deployed fleet. A local server is reached by overriding `server_url`
## (see `online_world.gd`, which reads FS_URL), not by editing this.
const DEPLOYED_URL := "wss://friendslop.kbve.com/ws"

@export var server_url := "ws://127.0.0.1:7980/ws"
@export var tick_hz := 60.0
@export var autoconnect := false
@export var avatar_scene: PackedScene

## Node whose Y rotation movement intent is expressed relative to — the camera,
## in practice. Unset sends the raw input vector, which is world-space and only
## correct while the camera happens to face -Z.
@export var intent_basis_path: NodePath

## Vestigial: guests are named by the server, and a name asked for is a name
## that could be someone else's. Render local_name(), never this.
@export var player_name := ""

## Supabase access token. Set means "join as this account" — the server verifies
## it and reads the name out of its claims, and refuses the session if it does
## not check out. Empty is guest mode.
@export var access_token := ""

# Built here rather than @onready so callers that reach for it before _ready
# get a live node instead of null.
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


## Name the server gave us. Empty until joined — the requested name is not the
## granted one, so nothing should be drawn before this answers.
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
	_client.set_intent(_world_wish(wish), Input.is_action_pressed("jump"))


## Input is in screen terms — left is left of the camera, not west. The server
## reads a world-space direction and has no idea where anyone is looking, so the
## rotation into world space belongs on this side of the wire.
func _world_wish(wish: Vector2) -> Vector2:
	if wish == Vector2.ZERO or intent_basis_path.is_empty():
		return wish
	var basis_node := get_node_or_null(intent_basis_path) as Node3D
	if basis_node == null:
		return wish
	# Godot's input +y is "back", and the session's wish_dir is [x, z] in world
	# space, where +z is also back. The two agree, so only the yaw is applied.
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
	# Handing the node to the extension is what makes the server drive it; a
	# node that is never tracked simply sits at the origin.
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
