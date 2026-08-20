extends Node3D


const GFX := preload("res://src/settings/graphics_settings.gd")
const TITLE_SCENE := "res://scenes/title.tscn"

@onready var _client: NetGameClient = $NetGameClient
@onready var _terrain: Node3D = $Terrain
@onready var _rig: Node3D = $CameraRig
@onready var _hud: OnlineHud = $OnlineHud
@onready var _day_night: Node3D = $DayNight
@onready var _stones: Node3D = $StoneField
@onready var _trees: Node3D = $TreeField

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

	var pause := get_node_or_null(^"PauseMenu")
	if pause:
		pause.log_off_override = _leave

	var auth := get_node_or_null(^"/root/Auth")
	if auth:
		if not auth.is_signed_in():
			auth.sign_in_as_guest()
		await auth.refresh_if_stale()
		_client.access_token = auth.access_token()

	_client.server_url = server_url()
	_hud.set_connecting(_client.server_url)
	_client.connect_to_server()


static func server_url() -> String:
	var override := OS.get_environment("FS_URL")
	return override if override != "" else NetGameClient.DEPLOYED_URL


func _on_joined(seed_value: int, assigned_name: String) -> void:
	# The world contract first, the seed last: adopting the seed rebakes the ground, and
	# it bakes at whatever extent and resolution it is holding when it runs.
	_adopt_world()
	if _terrain:
		_terrain.adopt_seed(seed_value)
	_hud.set_joined(assigned_name)
	_refresh_nameplates()


func _adopt_world() -> void:
	var extent := _client.terrain_extent()
	var resolution := _client.terrain_resolution()
	if _terrain and extent > 0.0 and resolution > 1:
		if not is_equal_approx(float(_terrain.extent), extent):
			_terrain.extent = extent
		if int(_terrain.resolution) != resolution:
			_terrain.resolution = resolution

	var water := _client.world_water_level()
	var road := _client.world_road_width()
	if _terrain and road > 0.0:
		if not is_equal_approx(float(_terrain.water_level), water):
			_terrain.water_level = water
		if not is_equal_approx(float(_terrain.road_width), road):
			_terrain.road_width = road

	# Rocks and trees are never sent: both sides scatter them from a seed and the
	# ground alone. That only holds while both scatter from the same numbers, and this
	# field planned from its own defaults a round trip ago -- before anyone had said
	# what world this is.
	if _stones:
		_stones.adopt_scatter(_client.world_stone_seed(), _client.world_stone_grid())
	if _trees:
		_trees.adopt_scatter(_client.world_tree_seed(), _client.world_tree_grid())

	var day_length := _client.day_length_minutes()
	if _day_night and day_length > 0.0:
		_day_night.set_day_length(day_length)
		_day_night.start_hour = _client.world_start_hour()


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
	avatar.bind_body(_client, body_id)
	if body_id == _client.local_body():
		_local_avatar = avatar
		avatar.mark_local(_rig)
		_rig.follow(avatar)
	_refresh_nameplates()


func _refresh_nameplates() -> void:
	for child in _client.get_children():
		var avatar := child as NetAvatar
		if avatar == null:
			continue
		var body_id := int(String(avatar.name).trim_prefix("Body"))
		avatar.set_player_name(_client.body_name(body_id))
	_hud.set_roster(_client.roster(), _client.local_body())


func _on_pet_spawned(body_id: int, node: Node3D) -> void:
	var pet := node as NetPet
	if pet:
		pet.bind_body(_client, body_id)
	_refresh_pets()


func _refresh_pets() -> void:
	_hud.set_pets(_client.my_pet_bodies().size(), _client.pet_count())


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
