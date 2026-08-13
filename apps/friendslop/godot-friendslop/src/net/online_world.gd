extends Node3D

## A session on the dedicated server: the world the host is simulating, drawn locally,
## with everyone in it named.

const GFX := preload("res://src/settings/graphics_settings.gd")
const TITLE_SCENE := "res://scenes/title.tscn"

@onready var _client: NetGameClient = $NetGameClient
@onready var _terrain: Node3D = $Terrain
@onready var _rig: Node3D = $CameraRig
@onready var _hud: OnlineHud = $OnlineHud

var _local_avatar: NetAvatar


func _enter_tree() -> void:
	GFX.apply_fields(self, GFX.saved_tier())


func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_client.joined.connect(_on_joined)
	_client.rejected.connect(_on_rejected)
	_client.avatar_spawned.connect(_on_avatar_spawned)
	_client.roster_changed.connect(_refresh_nameplates)
	_hud.leave_requested.connect(_leave)

	var auth := get_node_or_null(^"/root/Auth")
	if auth:
		if not auth.is_signed_in():
			auth.sign_in_as_guest()
		await auth.refresh_if_stale()
		_client.access_token = auth.access_token()

	_client.server_url = server_url()
	_hud.set_connecting(_client.server_url)
	_client.connect_to_server()


## `FS_URL` overrides, which is how a local server gets tested against a build that
## otherwise only knows about the deployed fleet.
static func server_url() -> String:
	var override := OS.get_environment("FS_URL")
	return override if override != "" else NetGameClient.DEPLOYED_URL


func _on_joined(seed_value: int, assigned_name: String) -> void:
	if _terrain and int(_terrain.terrain_seed) != seed_value:
		_terrain.terrain_seed = seed_value
	_hud.set_joined(assigned_name)
	_refresh_nameplates()


func _on_rejected(reason: String) -> void:
	_hud.set_rejected(reason)


func _on_avatar_spawned(body_id: int, node: Node3D) -> void:
	var avatar := node as NetAvatar
	if avatar == null:
		return
	if body_id == _client.local_body():
		_local_avatar = avatar
		avatar.mark_local()
		_rig.follow(avatar)
	_refresh_nameplates()


## Names arrive on their own message, so a body can exist for a frame or two before
## there is anything to write over it.
func _refresh_nameplates() -> void:
	for child in _client.get_children():
		var avatar := child as NetAvatar
		if avatar == null:
			continue
		var body_id := int(String(avatar.name).trim_prefix("Body"))
		avatar.set_player_name(_client.body_name(body_id))
	_hud.set_roster(_client.roster(), _client.local_body())


func _leave() -> void:
	_client.disconnect_from_server()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	LoadingScreen.swap(get_tree(), TITLE_SCENE, "Friendslop")
