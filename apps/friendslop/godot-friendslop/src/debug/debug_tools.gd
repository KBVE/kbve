extends Node3D

const SHRUB := preload("res://assets/environment/props/flora/euonymus/euonymus.fbx")
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

@onready var _player: CharacterBody3D = get_node(player_path)


func _ready() -> void:
	_cam = Camera3D.new()
	add_child(_cam)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("debug_freecam"):
		_toggle()
		return
	if event.is_action_pressed("debug_screenshot"):
		_screenshot()
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


func _toggle() -> void:
	_active = not _active
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
	marker.add_child(shrub)
	var label := Label3D.new()
	label.name = "Label"
	label.position = Vector3(0.0, 2.2, 0.0)
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
	var path := "%s/shot_%d.png" % [dir, Time.get_ticks_msec()]
	get_viewport().get_texture().get_image().save_png(path)
	print("screenshot: ", path)


func _clear_markers() -> void:
	for m in _markers:
		m.queue_free()
	_markers.clear()
