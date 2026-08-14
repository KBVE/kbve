extends Node3D

## A session on the dedicated server: the world the host is simulating, drawn locally,
## with everyone in it named.

const GFX := preload("res://src/settings/graphics_settings.gd")
const TITLE_SCENE := "res://scenes/title.tscn"

@onready var _client: NetGameClient = $NetGameClient
@onready var _terrain: Node3D = $Terrain
@onready var _rig: Node3D = $CameraRig
@onready var _hud: OnlineHud = $OnlineHud
@onready var _day_night: Node3D = $DayNight

var _local_avatar: NetAvatar
var _last_synced_hour := -1.0


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
	_adopt_world()
	_hud.set_joined(assigned_name)
	_refresh_nameplates()


## The host's terrain and clock win over whatever the scene was authored with. These
## used to be agreed by convention between two codebases, and disagreeing produced no
## error — just players standing slightly inside the ground, under their own sun.
func _adopt_world() -> void:
	var extent := _client.terrain_extent()
	var resolution := _client.terrain_resolution()
	if _terrain and extent > 0.0 and resolution > 1:
		if not is_equal_approx(float(_terrain.extent), extent):
			_terrain.extent = extent
		if int(_terrain.resolution) != resolution:
			_terrain.resolution = resolution

	# Through the setter, not the export: _hours_per_second is derived once in _ready,
	# so assigning the field here would leave the sky running at the authored rate and
	# visibly jump on every sync from the host.
	var day_length := _client.day_length_minutes()
	if _day_night and day_length > 0.0:
		_day_night.set_day_length(day_length)


## The host owns the clock but only resends it every couple of seconds. Writing that
## value every frame would freeze the sky between syncs and then jump it, so DayNight
## keeps advancing its own hour at frame rate and is corrected only when a new one
## actually arrives.
func _process(_delta: float) -> void:
	if _day_night == null or not _client.is_joined():
		return
	var synced := _client.world_hour()
	if is_equal_approx(synced, _last_synced_hour):
		return
	_last_synced_hour = synced
	_day_night.hour = synced


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
