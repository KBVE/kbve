extends CharacterBody3D

const SPEED := 5.0
const JUMP_VELOCITY := 4.5
const MOUSE_SENSITIVITY := 0.003
const PITCH_LIMITS := Vector2(-1.2, 0.6)

@onready var pivot: Node3D = $Pivot

var _touch := false


func _ready() -> void:
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
	if not is_on_floor():
		velocity += get_gravity() * delta

	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = JUMP_VELOCITY
		Game.events.notify(EventNames.PLAYER_JUMPED, global_position)

	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
	if direction:
		velocity.x = direction.x * SPEED
		velocity.z = direction.z * SPEED
	else:
		velocity.x = move_toward(velocity.x, 0.0, SPEED)
		velocity.z = move_toward(velocity.z, 0.0, SPEED)

	move_and_slide()
