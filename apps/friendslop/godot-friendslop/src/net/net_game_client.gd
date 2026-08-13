class_name NetGameClient
extends Node3D

## Renders a remote authoritative session.
##
## Bodies are authored by the server, so this node reacts to body_added /
## body_removed rather than spawning into a sim it does not own. Movement is
## never applied locally: input is sent as intent and the server decides what
## it means.

signal joined(seed_value: int)
signal rejected(reason: String)
signal avatar_spawned(body_id: int, node: Node3D)

@export var server_url := "ws://127.0.0.1:7980/ws"
@export var tick_hz := 60.0
@export var autoconnect := false
@export var avatar_scene: PackedScene

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


func connect_to_server(url: String = "") -> void:
	if url != "":
		server_url = url
	_client.server_url = server_url
	_client.tick_hz = tick_hz
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
	_client.set_intent(wish, Input.is_action_pressed("jump"))


func _on_joined(seed_value: int) -> void:
	joined.emit(seed_value)


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
