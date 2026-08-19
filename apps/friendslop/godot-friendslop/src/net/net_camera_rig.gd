class_name NetCameraRig
extends Node3D


@export var distance := 5.0
@export var height := 1.6
@export var sensitivity := 0.0035
@export var pitch_limits := Vector2(-1.15, 0.6)
@export var follow_smoothing := 14.0

var _yaw := 0.0
var _pitch := -0.18
var _target: Node3D


func follow(target: Node3D) -> void:
	_target = target
	if target:
		global_position = target.global_position + Vector3(0.0, height, 0.0)


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
## and the camera does not move at all. That reads as the camera lagging behind the
## mouse, and it reads worst exactly when the frame rate is already poor.
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


func _process(delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		return
	var anchor := _target.global_position + Vector3(0.0, height, 0.0)
	global_position = global_position.lerp(anchor, clampf(follow_smoothing * delta, 0.0, 1.0))
	rotation = Vector3(_pitch, _yaw, 0.0)
	var camera := get_node_or_null(^"Camera") as Camera3D
	if camera:
		camera.position = Vector3(0.0, 0.0, _clear_distance())


func _clear_distance() -> float:
	var space := get_world_3d().direct_space_state
	if space == null:
		return distance
	var from := global_position
	var to := from + global_transform.basis.z * distance
	var query := PhysicsRayQueryParameters3D.create(from, to)
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		return distance
	return maxf(from.distance_to(hit.position) - 0.35, 0.6)
