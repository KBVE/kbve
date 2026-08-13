extends CharacterBody3D

## Speeds, the jump impulse, the fall cap and the stopping rate are all
## QLocomotion's now, so the ring the rig blends over and the speed the body
## actually travels cannot drift apart -- and an authoritative server reaches the
## same numbers from the same intent. What is left here is input and the slide.
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
	var jump := Input.is_action_just_pressed("jump")
	var direction: Vector3 = rig.wish_direction(input_dir, global_rotation.y)

	# Offered the jump before the jump is: pressed against a ledge, climbing it
	# is what was meant, and a hop into the wall is not. The rig is left alone
	# while it owns the body, since it is playing its own climb.
	if _mantle.update(delta, direction, jump):
		_report(delta)
		return

	velocity = rig.step_motion(input_dir, jump, velocity, global_rotation.y,
			is_on_floor(), get_gravity().y, delta)
	if rig.jumped():
		Game.events.notify(EventNames.PLAYER_JUMPED, global_position)

	move_and_slide()
	rig.set_locomotion(global_transform.basis.inverse() * velocity, not is_on_floor(), delta)
	_report(delta)


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
