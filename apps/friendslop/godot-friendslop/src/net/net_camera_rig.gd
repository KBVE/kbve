class_name NetCameraRig
extends Node3D


## Named rather than referenced through the settings node, which carries no class_name
## and so cannot be reached statically.
const Gameplay := preload("res://src/settings/gameplay_settings.gd")

@export var distance := 5.0
@export var height := 1.6
@export var sensitivity := 0.0035
@export var pitch_limits := Vector2(-1.15, 0.6)
@export var follow_smoothing := 14.0

## Matched to the solo rig, so the same setting frames a player the same way in both.
@export var shoulder_side := 0.6
@export var shoulder_length := 2.2
@export var first_person_forward := 0.12
@export var margin := 0.35
@export var min_length := 0.6
@export var return_speed := 5.0
@export var ground_clearance := 0.35

var _yaw := 0.0
var _pitch := -0.18
var _target: Node3D
var _settings: Node
var _mode := Gameplay.CameraMode.THIRD
var _side := 0.0
var _len := 5.0


## There is no current scene under a test runner, and reaching through a null one for
## the settings takes the whole engine down rather than leaving the camera on its
## defaults, which is what having no settings should mean.
func _world_root() -> Node:
	return get_tree().current_scene if is_inside_tree() else null


func _ready() -> void:
	_len = distance
	var root := _world_root()
	_settings = root.get_node_or_null(^"GameplaySettings") if root else null
	if _settings:
		_settings.changed.connect(_read_settings)
		_read_settings()


func _read_settings() -> void:
	_mode = int(_settings.camera_mode)
	if _mode == Gameplay.CameraMode.FIRST:
		_len = 0.0
		_side = 0.0
	_show_body()


## The local player's own body is in the way in first person and wanted in every other
## mode. Remote avatars are never hidden -- they are the point.
func _show_body() -> void:
	if _target == null or not is_instance_valid(_target):
		return
	var mesh := _target.get_node_or_null(^"Mesh") as Node3D
	if mesh:
		mesh.visible = _mode != Gameplay.CameraMode.FIRST


func follow(target: Node3D) -> void:
	_target = target
	if target:
		global_position = target.global_position + Vector3(0.0, height, 0.0)
	_show_body()


func intent_basis() -> float:
	return _yaw


## How far the pointer can appear to have moved in the first report after the window
## takes it. Capturing warps the pointer, and the warp arrives as a motion event that
## would otherwise spin the camera on the spot.
const CAPTURE_JUMP_PX := 200.0

var _had_pointer := false


## Turns by one pointer report.
##
## The capture jump is skipped only on the first report after the window takes the
## pointer, which is the only report it can be. Applied to every report instead, it also
## throws away real turns: Godot merges pending motion into one event, so a fast flick --
## or an ordinary turn across a frame that ran long -- arrives as a single large delta
## and the camera does not move at all.
func apply_pointer(relative: Vector2) -> void:
	if not _had_pointer:
		_had_pointer = true
		if relative.length() > CAPTURE_JUMP_PX:
			return
	_yaw -= relative.x * sensitivity
	_pitch = clampf(_pitch - relative.y * sensitivity, pitch_limits.x, pitch_limits.y)


## Forgets that the pointer was ever held, so the next report is treated as a warp
## again. Letting go and taking it back warps it a second time.
func release_pointer() -> void:
	_had_pointer = false


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventMouseMotion):
		return
	if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		release_pointer()
		return
	apply_pointer((event as InputEventMouseMotion).relative)


## How far back the camera wants to sit, before anything is in the way.
func _target_arm() -> float:
	match _mode:
		Gameplay.CameraMode.FIRST:
			return 0.0
		Gameplay.CameraMode.SHOULDER:
			return shoulder_length
	return distance


func _process(delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		return
	var anchor := _target.global_position + Vector3(0.0, height, 0.0)
	global_position = global_position.lerp(anchor, clampf(follow_smoothing * delta, 0.0, 1.0))
	rotation = Vector3(_pitch, _yaw, 0.0)
	var wanted := shoulder_side if _mode == Gameplay.CameraMode.SHOULDER else 0.0
	_side = lerpf(_side, wanted, 1.0 - exp(-return_speed * delta))
	var camera := get_node_or_null(^"Camera") as Camera3D
	if camera == null:
		return
	if _mode == Gameplay.CameraMode.FIRST:
		camera.position = Vector3(0.0, 0.0, -first_person_forward)
		return
	camera.position = Vector3(_side, 0.0, _len)


## Keeps the camera out of the world, and out of the ground.
##
## In [method Node._physics_process] because that is where a space query belongs: asking
## the physics server for its state from a frame callback reaches across to whatever the
## physics thread is in the middle of.
##
## Measured from the shoulder the camera actually sits over rather than from the pivot,
## or the arm swings the camera through the very wall the probe just cleared.
func _physics_process(delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		return
	var arm := _target_arm()
	if is_zero_approx(arm):
		_len = 0.0
		return
	var origin := global_position + global_transform.basis.x * _side
	var wanted := arm
	var space := get_world_3d().direct_space_state
	if space:
		var query := PhysicsRayQueryParameters3D.create(
			origin, origin + global_transform.basis.z * arm
		)
		var hit := space.intersect_ray(query)
		if not hit.is_empty():
			wanted = maxf(origin.distance_to(hit.position) - margin, min_length)
	# Snapped in when something is closer and eased out when it is not, so the camera
	# never spends a frame inside whatever it just found.
	if wanted < _len:
		_len = wanted
	else:
		_len = lerpf(_len, wanted, 1.0 - exp(-return_speed * delta))
	_keep_off_the_ground()


func _keep_off_the_ground() -> void:
	var root := _world_root()
	var terrain := root.get_node_or_null(^"Terrain") if root else null
	if terrain == null or not terrain.has_method(&"height_at"):
		return
	var camera := get_node_or_null(^"Camera") as Camera3D
	if camera == null:
		return
	var at := camera.global_position
	var floor_y: float = terrain.height_at(at.x, at.z) + ground_clearance
	if at.y < floor_y:
		camera.global_position.y = floor_y
