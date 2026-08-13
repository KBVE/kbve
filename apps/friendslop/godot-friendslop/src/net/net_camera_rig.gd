class_name NetCameraRig
extends Node3D

## Third-person camera for a server-driven avatar.
##
## Separate from `camera_rig.gd`, which hangs off the local player and solves
## against terrain the client owns. Here the body is not ours to move: the rig
## follows a node the network writes, so it smooths rather than steers, and the
## only thing it is authoritative about is where the player is looking — which
## is also what makes it the frame movement intent is expressed in.

@export var distance := 5.0
@export var height := 1.6
@export var sensitivity := 0.0035
@export var pitch_limits := Vector2(-1.15, 0.6)
## Snapshots arrive at 20 Hz. Following the target directly would show that
## cadence as a stutter on every frame in between.
@export var follow_smoothing := 14.0

var _yaw := 0.0
var _pitch := -0.18
var _target: Node3D


func follow(target: Node3D) -> void:
	_target = target
	if target:
		global_position = target.global_position + Vector3(0.0, height, 0.0)


## Yaw only: movement intent is horizontal, and folding pitch in would make
## looking down a request to walk into the ground.
func intent_basis() -> float:
	return _yaw


## Capturing the cursor warps it, and the warp arrives as one enormous relative
## motion — enough on its own to slam the pitch into its clamp, which is how the
## camera ends up staring at the ground the moment a session opens. No hand
## moves a mouse this far in one event, so the jump is always the artefact.
const CAPTURE_JUMP_PX := 200.0


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var motion := event as InputEventMouseMotion
		if motion.relative.length() > CAPTURE_JUMP_PX:
			return
		_yaw -= motion.relative.x * sensitivity
		_pitch = clampf(_pitch - motion.relative.y * sensitivity, pitch_limits.x, pitch_limits.y)


func _process(delta: float) -> void:
	if _target == null or not is_instance_valid(_target):
		return
	var anchor := _target.global_position + Vector3(0.0, height, 0.0)
	global_position = global_position.lerp(anchor, clampf(follow_smoothing * delta, 0.0, 1.0))
	rotation = Vector3(_pitch, _yaw, 0.0)
	var camera := get_node_or_null(^"Camera") as Camera3D
	if camera:
		camera.position = Vector3(0.0, 0.0, _clear_distance())


## Pulls the camera in until nothing is between it and the player. Spawn points
## are wherever the server put them — under the bridge deck, inside a hillside —
## and a camera that starts inside geometry shows the inside of a plank rather
## than the game.
func _clear_distance() -> float:
	var space := get_world_3d().direct_space_state
	if space == null:
		return distance
	var from := global_position
	var to := from + global_transform.basis.z * distance
	var query := PhysicsRayQueryParameters3D.create(from, to)
	# The player's own body is a server-side capsule with no collider here, so
	# there is nothing of ours to exclude — anything hit is world geometry.
	var hit := space.intersect_ray(query)
	if hit.is_empty():
		return distance
	# Short of the surface: sitting exactly on it puts the near plane through it.
	return maxf(from.distance_to(hit.position) - 0.35, 0.6)
