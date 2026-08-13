extends CharacterBody3D

const SPEED := 5.0
## Held low enough that neither heading rides onto its jog clip. The blend ring
## puts backwards at radius 1.28 and sideways at 1.61, both walk-weighted, which
## is where those two clips hold up; pushing either toward the jog end is what
## made the backpedal look janky. Both still solve to a playback rate of 1.0, so
## nothing is being stretched to fit.
##
## They also sit close together on purpose, so a diagonal is not visibly quicker
## than either heading it is made of.
const BACK_SPEED := 2.0
const STRAFE_SPEED := 2.2
const JUMP_VELOCITY := 4.5
const TERMINAL_FALL := 55.0
const MOUSE_SENSITIVITY := 0.003
const PITCH_LIMITS := Vector2(-1.2, 0.6)

const Mantle := preload("res://src/player/mantle.gd")

@onready var pivot: Node3D = $Pivot
@onready var rig: Node3D = $Mesh

var _touch := false
var _mantle := Mantle.new()
## Q_WALK="x,z" leans on the stick without a hand on it, and "auto" sweeps it
## through every heading. Walking into a jam by hand to find out whether the
## character can climb back out of it is the slow half of testing this.
var _walk := Vector2.ZERO
var _walk_sweep := false
var _walk_t := 0.0
var _debug_t := 0.0


func _ready() -> void:
	_mantle.setup(self, rig)
	var walk := OS.get_environment("Q_WALK")
	_walk_sweep = walk == "auto"
	var axes := walk.split(",", false)
	if axes.size() == 2:
		_walk = Vector2(float(axes[0]), float(axes[1]))
	var pitch := OS.get_environment("Q_PITCH")
	if pitch != "":
		pivot.rotation.x = clampf(float(pitch), -1.5, 1.5)
	_touch = DisplayServer.is_touchscreen_available()
	if OS.has_feature("mobile"):
		_use_mobile_materials()


## The screen-space ink pass depends on Forward+ only inputs, so it is dropped
## under the mobile renderer.
func _use_mobile_materials() -> void:
	var ink: Node = get_node_or_null("Pivot/Camera3D/InkLines")
	if ink:
		ink.visible = false


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _unhandled_input(event: InputEvent) -> void:
	# Touch devices synthesise mouse motion from drags by default, so the mouse
	# path has to stay shut there or every look drag is applied twice.
	if _touch:
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_look(event.relative * MOUSE_SENSITIVITY)
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _look(delta: Vector2) -> void:
	rotate_y(-delta.x)
	pivot.rotate_x(-delta.y)
	pivot.rotation.x = clampf(pivot.rotation.x, PITCH_LIMITS.x, PITCH_LIMITS.y)


func _process(_delta: float) -> void:
	if not _touch:
		return
	var controls := get_tree().get_first_node_in_group("touch_controls")
	if controls:
		_look(controls.consume_look())


func _physics_process(delta: float) -> void:
	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if _walk_sweep:
		_walk_t += delta
		input_dir = Vector2.RIGHT.rotated(_walk_t * 0.8)
	elif _walk != Vector2.ZERO:
		input_dir = _walk
	var direction := (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()

	# Offered the jump before the jump is: pressed against a ledge, climbing it
	# is what was meant, and a hop into the wall is not. The rig is left alone
	# while it owns the body, since it is playing its own climb.
	if _mantle.update(delta, direction, Input.is_action_just_pressed("jump")):
		_report(delta)
		return

	if not is_on_floor():
		velocity += get_gravity() * delta
		# Capped so a fall that never lands cannot wind gravity up without
		# bound. Left open, a body held off the floor by geometry it is stuck in
		# builds a speed that fires it through the world the moment it comes
		# free.
		velocity.y = maxf(velocity.y, -TERMINAL_FALL)

	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = JUMP_VELOCITY
		Game.events.notify(EventNames.PLAYER_JUMPED, global_position)

	if direction:
		var gait := _gait(input_dir.normalized())
		velocity.x = direction.x * gait
		velocity.z = direction.z * gait
	else:
		velocity.x = move_toward(velocity.x, 0.0, SPEED)
		velocity.z = move_toward(velocity.z, 0.0, SPEED)

	move_and_slide()
	rig.set_locomotion(global_transform.basis.inverse() * velocity, not is_on_floor(), delta)
	_report(delta)


## Top speed for a heading. y is positive going backwards, so the two halves are
## blended separately rather than through its magnitude -- which is the same
## mistake that had the animation treating a backpedal as a forward run.
##
## A diagonal lands between its two headings, so backing away at an angle is
## quicker than backing away straight. That follows from sideways and backwards
## differing at all, and matches the blend the rig does over the same ring.
func _gait(dir: Vector2) -> float:
	if dir.y > 0.0:
		return lerpf(STRAFE_SPEED, BACK_SPEED, dir.y)
	return lerpf(STRAFE_SPEED, SPEED, -dir.y)


func _report(delta: float) -> void:
	if OS.get_environment("Q_MOVE_DEBUG") == "":
		return
	_debug_t += delta
	if _debug_t < 0.5:
		return
	_debug_t = 0.0
	print("[move] at=(%.1f,%.1f,%.1f) floor=%s vy=%+.2f slides=%d anim=%s" % [
			global_position.x, global_position.y, global_position.z,
			str(is_on_floor()), velocity.y, get_slide_collision_count(),
			rig.debug_state()])
