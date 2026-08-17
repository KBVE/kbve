extends Node3D

const SHRUB := preload("res://assets/environment/props/flora/euonymus/euonymus.fbx")
const CreatureSpawner := preload("res://src/characters/creature_spawner.gd")
const MARKER_SCRIPT := preload("res://src/debug/debug_marker.gd")

@export var player_path: NodePath
@export var fly_speed := 12.0
@export var mouse_sensitivity := 0.003

var _active := false
var _cam: Camera3D
var _prev_cam: Camera3D
var _markers: Array[Node3D] = []
var _yaw := 0.0
var _pitch := 0.0
var _place_queued := false
var _smoke_state := 0
var _shot_frames := -1
var _spawners: Array[Node3D] = []
var _overlay: Node3D

@onready var _player: CharacterBody3D = get_node(player_path)


const CollisionOverlay := preload("res://src/debug/debug_collision_overlay.gd")


func _ready() -> void:
	_cam = Camera3D.new()
	add_child(_cam)
	_overlay = CollisionOverlay.new()
	add_child(_overlay)
	var shot := OS.get_environment("Q_SHOT")
	if shot != "":
		_shot_frames = maxi(int(shot), 1)
	var extra := OS.get_environment("Q_CREATURES")
	if extra != "":
		_spawn_creatures.call_deferred(extra)


## Q_CREATURES=all, or a comma-separated pick of George,Leela,Mike,Stan, adds another
## group in front of the player.
func _spawn_creatures(which: String) -> void:
	var spawner: Node3D = CreatureSpawner.new()
	if which != "all":
		var picked: Array[String] = []
		for name in which.split(",", false):
			picked.append(name)
		spawner.mechs = picked
	add_child(spawner)
	spawner.global_position = _player.global_position - _player.global_basis.z * 26.0
	var terrain := get_tree().current_scene.get_node_or_null("Terrain")
	if terrain:
		spawner.terrain_path = spawner.get_path_to(terrain)
	_spawners.append(spawner)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("debug_freecam"):
		_toggle()
		return
	if event.is_action_pressed("debug_screenshot"):
		_screenshot()
		return
	# I used to fire a bare impact frame. It is the satchel key now -- O below still
	# reaches the same effect with the arc and the burst, which is what it looks like
	# in play anyway.
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_O:
		var hit := _player.global_position + Vector3(0.0, 1.2, 0.0) - _player.global_basis.z * 1.2
		var slash := _player.get_node_or_null("SlashArc")
		if slash:
			slash.slash()
		var burst := get_node_or_null("../ImpactBurst")
		if burst:
			burst.burst_at(hit, Color(1.0, 0.85, 0.4))
		var frame := get_node_or_null("../ImpactFX")
		if frame:
			frame.combo_at(hit)
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_U:
		var nuke_fx := get_node_or_null("../ImpactFX")
		if nuke_fx:
			nuke_fx.nuke(12.0, 0.28, Color(0.0, 0.0, 0.0, 1.0), 0.6)
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_Y:
		var burst_fx := get_node_or_null("../ImpactFX")
		if burst_fx:
			burst_fx.blackhole_at(_player.global_position + Vector3(0.0, 1.6, 0.0) - _player.global_basis.z * 3.0)
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_K:
		_chop_nearest()
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_P:
		var smoke := _player.get_node_or_null("StatusSmoke")
		if smoke:
			_smoke_state = (_smoke_state + 1) % 3
			smoke.set_status(["none", "poison", "curse"][_smoke_state])
		return
	if not _active:
		return
	if event.is_action_pressed("ui_cancel"):
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		else:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_yaw -= event.relative.x * mouse_sensitivity
		_pitch = clampf(_pitch - event.relative.y * mouse_sensitivity, -1.5, 1.5)
		_cam.rotation = Vector3(_pitch, _yaw, 0.0)
	elif event.is_action_pressed("debug_marker"):
		_place_queued = true
	elif event.is_action_pressed("debug_clear"):
		_clear_markers()
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			fly_speed = minf(fly_speed * 1.2, 200.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			fly_speed = maxf(fly_speed / 1.2, 1.0)


## Drives one swing through the same API the net path uses, so felling can be
## looked at before the swing input exists.
func _chop_nearest() -> void:
	var trees := get_node_or_null("../TreeField")
	if trees == null:
		return
	var ids: PackedInt64Array = trees.query_radius(_player.global_position, 12.0, 1)
	if ids.is_empty():
		return
	trees.apply_damage(ids[0], 1)


func _toggle() -> void:
	_active = not _active
	var grass := get_node_or_null("../GrassField")
	if grass:
		grass.set_debug_tint(_active)
	if _overlay:
		_overlay.set_shown(_active)
	if _active:
		_prev_cam = get_viewport().get_camera_3d()
		_cam.global_transform = _prev_cam.global_transform
		_yaw = _cam.global_rotation.y
		_pitch = _cam.global_rotation.x
		_cam.current = true
		_player.process_mode = Node.PROCESS_MODE_DISABLED
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		_player.process_mode = Node.PROCESS_MODE_INHERIT
		if _prev_cam:
			_prev_cam.current = true


func _process(delta: float) -> void:
	if _shot_frames > 0:
		_shot_frames -= 1
		if _shot_frames == 0:
			_screenshot()
			get_tree().quit()
	if not _active:
		return
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var motion := _cam.global_basis * Vector3(input_dir.x, 0.0, input_dir.y)
	if Input.is_action_pressed("jump"):
		motion.y += 1.0
	if Input.is_action_pressed("debug_down"):
		motion.y -= 1.0
	_cam.global_position += motion.normalized() * fly_speed * delta if motion.length() > 0.0 else Vector3.ZERO


func _physics_process(_delta: float) -> void:
	if not _place_queued:
		return
	_place_queued = false
	var origin := _cam.global_position
	var target := origin - _cam.global_basis.z * 500.0
	var query := PhysicsRayQueryParameters3D.create(origin, target)
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if hit:
		_spawn_marker(hit.position)


func _spawn_marker(pos: Vector3) -> void:
	var marker := Node3D.new()
	marker.set_script(MARKER_SCRIPT)
	var shrub := SHRUB.instantiate()
	shrub.scale = Vector3(2.0, 2.0, 2.0)
	marker.add_child(shrub)
	var label := Label3D.new()
	label.name = "Label"
	label.position = Vector3(0.0, 4.2, 0.0)
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 96
	label.outline_size = 24
	label.no_depth_test = true
	marker.add_child(label)
	add_child(marker)
	marker.global_position = pos
	marker.player = _player
	_markers.append(marker)


func _screenshot() -> void:
	var dir := ProjectSettings.globalize_path("res://screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	for spawner in get_tree().get_nodes_in_group(CreatureSpawner.GROUP):
		for p in spawner.spawned:
			print("  creature ", p.rig.display_name, " at ", p.global_position,
					" gap=%.1f" % p.global_position.distance_to(_player.global_position),
					" state=", p.rig.debug_state(),
					" dot=%.2f" % p.motion_dot,
					" hits=", p.get_slide_collision_count())
	var path := "%s/shot_%d.png" % [dir, Time.get_ticks_msec()]
	get_viewport().get_texture().get_image().save_png(path)
	print("screenshot: ", path)


func _clear_markers() -> void:
	for m in _markers:
		m.queue_free()
	_markers.clear()
