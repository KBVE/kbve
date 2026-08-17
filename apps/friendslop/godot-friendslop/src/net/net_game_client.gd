class_name NetGameClient
extends Node3D


signal joined(seed_value: int, player_name: String)
signal rejected(reason: String)
signal avatar_spawned(body_id: int, node: Node3D)
signal roster_changed()
signal pet_spawned(body_id: int, node: Node3D)
signal pets_changed()
signal pet_denied(reason: String)
signal harvest_applied(target: StringName, id: int, stage: int)
signal harvest_rewarded(target: StringName, id: int, ore: StringName, amount: int)

const GROUP := &"net_game_client"

const TARGET_STONE := 0
const TARGET_TREE := 1

const DEPLOYED_URL := "wss://friendslop.kbve.com/ws"

@export var server_url := "ws://127.0.0.1:7980/ws"
@export var tick_hz := 60.0
@export var autoconnect := false
@export var avatar_scene: PackedScene

@export var intent_basis_path: NodePath

@export var player_name := ""

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


func harvest_begin(kind: StringName, cell: Vector2i, ordinal: int) -> void:
	if not is_joined():
		return
	if kind == &"tree":
		_client.harvest_tree(cell.x, cell.y, ordinal)
	else:
		_client.harvest_stone(cell.x, cell.y, ordinal)


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


func local_name() -> String:
	return _client.local_name()


func body_name(body_id: int) -> String:
	return _client.body_name(body_id)


## Velocity the host published for a body, on the same clock it is drawn at.
func body_velocity(body_id: int) -> Vector3:
	return _client.body_velocity(body_id)


func interp_depth() -> int:
	return _client.interp_depth()


func roster() -> Dictionary[int, String]:
	var out: Dictionary[int, String] = {}
	var bodies := _client.roster_bodies()
	var names := _client.roster_names()
	for i in mini(bodies.size(), names.size()):
		out[bodies[i]] = names[i]
	return out


func world_seed() -> int:
	return _client.world_seed()


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


func _facing() -> float:
	if intent_basis_path.is_empty():
		return 0.0
	var basis_node := get_node_or_null(intent_basis_path) as Node3D
	return basis_node.global_rotation.y if basis_node else 0.0


func world_hour() -> float:
	return _client.world_hour()


func world_elapsed() -> float:
	return _client.world_elapsed()


func world_day() -> int:
	return _client.world_day()


func world_start_hour() -> float:
	return _client.world_start_hour()


func day_length_minutes() -> float:
	return _client.day_length_minutes()


func terrain_extent() -> float:
	return _client.terrain_extent()


func terrain_resolution() -> int:
	return _client.terrain_resolution()


func world_water_level() -> float:
	return _client.world_water_level()


func world_road_width() -> float:
	return _client.world_road_width()


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


func deploy_pet(kind: int = 0) -> void:
	_client.deploy_pet(kind)


func recall_pet(body_id: int) -> void:
	var pet_id: int = _client.pet_id_of(body_id)
	if pet_id >= 0:
		_client.recall_pet(pet_id)


func recall_all_pets() -> void:
	_client.recall_pets()


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
