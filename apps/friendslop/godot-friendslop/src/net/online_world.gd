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


func _enter_tree() -> void:
	GFX.apply_fields(self, GFX.saved_tier())


func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_client.joined.connect(_on_joined)
	_client.rejected.connect(_on_rejected)
	_client.avatar_spawned.connect(_on_avatar_spawned)
	_client.roster_changed.connect(_refresh_nameplates)
	_client.pets_changed.connect(_refresh_pets)
	_client.pet_spawned.connect(_on_pet_spawned)
	_client.pet_denied.connect(_hud.show_notice)
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

	# The deck's height comes out of these, so they belong to the host for the same
	# reason the extent does: a bridge in two places is a player walking on planks
	# their own server thinks are river.
	var water := _client.world_water_level()
	var road := _client.world_road_width()
	if _terrain and road > 0.0:
		if not is_equal_approx(float(_terrain.water_level), water):
			_terrain.water_level = water
		if not is_equal_approx(float(_terrain.road_width), road):
			_terrain.road_width = road

	# Both constants of the clock, and the day length through the setter rather than the
	# export because _hours_per_second is derived from it once in _ready. The hour is
	# derived from the host's elapsed seconds through the same mapping on both sides, so
	# keeping the scene's own start hour would leave this sky a fixed offset from
	# everyone else's for the whole session.
	var day_length := _client.day_length_minutes()
	if _day_night and day_length > 0.0:
		_day_night.set_day_length(day_length)
		_day_night.start_hour = _client.world_start_hour()


## The host resends the clock every couple of seconds, and the extension runs it on
## between those, so what arrives here is already continuous. The sky is written from it
## every frame rather than corrected on arrival: seconds and an hour derived from them
## the same way on both sides leave nothing to correct, where an hour on its own could
## only ever be snapped to.
func _process(_delta: float) -> void:
	if _day_night == null or not _client.is_joined():
		return
	_day_night.set_world_time(_client.world_elapsed())


func _on_rejected(reason: String) -> void:
	_hud.set_rejected(reason)


func _on_avatar_spawned(body_id: int, node: Node3D) -> void:
	var avatar := node as NetAvatar
	if avatar == null:
		return
	if body_id == _client.local_body():
		_local_avatar = avatar
		avatar.mark_local(_rig)
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


func _on_pet_spawned(_body_id: int, _node: Node3D) -> void:
	_refresh_pets()


func _refresh_pets() -> void:
	_hud.set_pets(_client.my_pet_bodies().size())


func _unhandled_input(event: InputEvent) -> void:
	if not _client.is_joined():
		return
	if event.is_action_pressed(&"deploy_pet"):
		_client.deploy_pet(_client.my_pet_bodies().size() % NetPet.CHASSIS.size())
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed(&"recall_pets"):
		_client.recall_all_pets()
		get_viewport().set_input_as_handled()


func _leave() -> void:
	_client.disconnect_from_server()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	LoadingScreen.swap(get_tree(), TITLE_SCENE, "Friendslop")
