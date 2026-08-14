extends CharacterBody3D

## Speeds, the jump impulse, the fall cap and the stopping rate are all QLocomotion's
## now, so the ring the rig blends over and the speed the body actually travels cannot
## drift apart -- and an authoritative server reaches the same numbers from the same
## intent.
const MOUSE_SENSITIVITY := 0.003
const PITCH_LIMITS := Vector2(-1.2, 0.6)

const Mantle := preload("res://src/player/mantle.gd")

## The ground is baked on a worker thread, so for the first frames of a scene there is
## no collider anywhere and gravity has nothing to land on.
@export var terrain_path: NodePath = ^"../Terrain"
## Clearance kept above the ground when the body is settled onto it.
@export var settle_clearance := 1.0
## How far under the ground the body has to be before it counts as having fallen through
## the world rather than standing in a dip the height field smooths over.
@export var fall_through_slack := 3.0
## Crouch held for less than this is read as a tap, and a tap rolls. A tap can only be
## told apart from a hold once the key comes back up, so this is also how long a roll
## waits before it starts -- short enough not to read as lag, long enough that settling
## into a crouch never flickers through a roll.
@export var crouch_tap_time := 0.16

@onready var pivot: Node3D = $Pivot
@onready var rig: Node3D = $Mesh

var _terrain: Node
## Held until there is ground, so the fall never starts.
var _held := false

var _touch := false
var _talking := false
var _mantle := Mantle.new()
## Q_WALK="x,z" leans on the stick without a hand on it, and "auto" sweeps it through
## every heading.
var _walk := Vector2.ZERO
var _walk_sweep := false
var _walk_t := 0.0
var _debug_t := 0.0
## How long the crouch key has been down, and whether it has been down long enough to
## count as a hold rather than the tap that rolls.
var _crouch_t := -1.0
var _crouching := false


func _ready() -> void:
	_mantle.setup(self, rig)
	_wait_for_ground()
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


func _wait_for_ground() -> void:
	_terrain = get_node_or_null(terrain_path)
	## Dropped rather than kept, so nothing downstream asks a node that cannot answer.
	if _terrain != null and not (_terrain.has_method("is_ground_ready")
			and _terrain.has_method("height_at")):
		_terrain = null
	if _terrain == null:
		return
	if _terrain.is_ground_ready():
		return
	_held = true
	if _terrain.has_signal("ground_ready"):
		_terrain.ground_ready.connect(_settle, CONNECT_ONE_SHOT)


## Puts the body on the ground and lets it move again. The terrain picks the spawn itself
## once it has heights, so this only lifts a body that would otherwise start underneath
## one.
func _settle() -> void:
	_held = false
	velocity = Vector3.ZERO
	if _terrain == null or not _terrain.is_ground_ready():
		return
	var ground: float = _terrain.height_at(global_position.x, global_position.z)
	global_position.y = maxf(global_position.y, ground + settle_clearance)


## True once the body is under the ground by more than any dip explains, which is the
## shape a fall through the world takes: a hitch long enough to outrun the collider, or a
## spawn that beat it.
func _fell_through() -> bool:
	if _held or _terrain == null or not _terrain.is_ground_ready():
		return false
	return global_position.y < _terrain.height_at(global_position.x, global_position.z) \
			- fall_through_slack


## The screen-space ink pass depends on Forward+ only inputs, so it is dropped under the
## mobile renderer.
func _use_mobile_materials() -> void:
	var ink: Node = get_node_or_null("Pivot/Camera3D/InkLines")
	if ink:
		ink.visible = false


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


## Held mid-conversation: the body stops taking the stick, and a click on a reply is not
## also a click that recaptures the mouse.
func set_talking(on: bool) -> void:
	_talking = on


func _unhandled_input(event: InputEvent) -> void:
	if _touch or _talking:
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
	if _held:
		velocity = Vector3.ZERO
		rig.set_locomotion(Vector3.ZERO, false, delta)
		return
	if _fell_through():
		push_warning("[player] fell through the world at %.1f,%.1f,%.1f; put back on the ground" % [
				global_position.x, global_position.y, global_position.z])
		_settle()

	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	## Standing and listening, but still falling if the ground goes away underneath.
	if _talking:
		input_dir = Vector2.ZERO
	if _walk_sweep:
		_walk_t += delta
		input_dir = Vector2.RIGHT.rotated(_walk_t * 0.8)
	elif _walk != Vector2.ZERO:
		input_dir = _walk
	var jump := Input.is_action_just_pressed("jump")
	var roll := _read_crouch(delta)
	var direction: Vector3 = rig.wish_direction(input_dir, global_rotation.y)

	if _mantle.update(delta, direction, jump):
		_report(delta)
		return

	velocity = rig.step_motion(input_dir, jump, _crouching and not _talking, roll,
			velocity, global_rotation.y, is_on_floor(), get_gravity().y, delta)
	if rig.jumped():
		Game.events.notify(EventNames.PLAYER_JUMPED, global_position)

	move_and_slide()
	rig.set_locomotion(global_transform.basis.inverse() * velocity, not is_on_floor(), delta)
	_report(delta)


## One key does both stances: held it crouches, released early it rolls. Returns whether
## this tick is the one that throws a roll.
func _read_crouch(delta: float) -> bool:
	if Input.is_action_pressed("crouch"):
		_crouch_t = 0.0 if _crouch_t < 0.0 else _crouch_t + delta
		_crouching = _crouch_t >= crouch_tap_time
		return false
	var tapped := _crouch_t >= 0.0 and _crouch_t < crouch_tap_time
	_crouch_t = -1.0
	_crouching = false
	return tapped


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
