extends CharacterBody3D

const MOUSE_SENSITIVITY := 0.003
const PITCH_LIMITS := Vector2(-1.2, 0.6)

const Mantle := preload("res://src/player/mantle.gd")

@export var terrain_path: NodePath = ^"../Terrain"
@export var physics_path: NodePath = ^"../Physics"
const CAPSULE_RADIUS := 0.5
const CAPSULE_HALF_HEIGHT := 0.5
const CAPSULE_CENTER := Vector3(0.0, 1.0, 0.0)
const COYOTE_TIME := 0.12
const BLOCKED_FRACTION := 0.5
const BLOCKED_SECONDS := 0.15
@export var settle_clearance := 1.0
@export var fall_through_slack := 3.0

@export_group("Body")
@export var strength := 3
@export var skill := 3
@export var will := 3
@export var jump_energy := 8.0
@export var roll_energy := 14.0

@onready var pivot: Node3D = $Pivot
@onready var rig: Node3D = $Mesh

var _terrain: Node
var _held := false

var _sim: Node
var _sim_id := 0
var _airborne_t := 0.0

var _touch := false
var _talking := false
var _mantle := Mantle.new()
var _walk := Vector2.ZERO
var _walk_sweep := false
var _walk_t := 0.0
var _debug_t := 0.0
var _blocked_t := 0.0


func _ready() -> void:
	_mantle.setup(self, rig)
	_wait_for_ground()
	_find_sim()
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
	Vitals.enlist(Vitals.PLAYER, strength, skill, will)


func _find_sim() -> void:
	if OS.get_environment("Q_GODOT_PHYSICS") != "":
		return
	if physics_path.is_empty():
		return
	var node := get_node_or_null(physics_path)
	if node == null or not node.has_method("spawn_character"):
		return
	_sim = node


func _join_sim() -> void:
	if _sim == null or _sim_id != 0 or not _sim.is_terrain_ready():
		return
	_sim_id = _sim.spawn_character(self, CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS, CAPSULE_CENTER,
			collision_layer, collision_mask)


## Gives up on the velocity we planned when the sim says we are not achieving it.
##
## The sim publishes one velocity per tick and clears the translation it accumulated,
## so read once per frame it is both stale and, on any tick that received no command,
## an outright zero. Against an instantaneous plan that reads as a wall roughly a
## fifth of the time while simply walking -- measured at 375 of 1860 frames -- and
## each false positive drops the plan to a standstill for a frame, which the rig
## animates as a restart. Only a shortfall that persists is a wall.
func _adopt_blocked_velocity(delta: float) -> void:
	var actual: Vector3 = _sim.body_velocity(_sim_id)
	var planned := Vector2(velocity.x, velocity.z)
	var moved := Vector2(actual.x, actual.z)
	if planned.length() <= 0.01 or moved.length() >= planned.length() * BLOCKED_FRACTION:
		_blocked_t = 0.0
		return
	_blocked_t += delta
	if _blocked_t < BLOCKED_SECONDS:
		return
	velocity.x = actual.x
	velocity.z = actual.z


func _grounded() -> bool:
	return _sim.character_grounded(_sim_id) if _sim_id != 0 else is_on_floor()


func _wait_for_ground() -> void:
	_terrain = get_node_or_null(terrain_path)
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


func _settle() -> void:
	_held = false
	velocity = Vector3.ZERO
	if _terrain == null or not _terrain.is_ground_ready():
		return
	var ground: float = _terrain.height_at(global_position.x, global_position.z)
	global_position.y = maxf(global_position.y, ground + settle_clearance)
	if _sim_id != 0:
		_sim.teleport_character(_sim_id, global_position)


func _fell_through() -> bool:
	if _held or _terrain == null or not _terrain.is_ground_ready():
		return false
	return global_position.y < _terrain.height_at(global_position.x, global_position.z) \
			- fall_through_slack


func _use_mobile_materials() -> void:
	var ink: Node = get_node_or_null("Pivot/Camera3D/InkLines")
	if ink:
		ink.visible = false


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func set_talking(on: bool) -> void:
	_talking = on


func is_talking() -> bool:
	return _talking


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
	_join_sim()
	if _held:
		velocity = Vector3.ZERO
		rig.drive(Vector3.ZERO, global_rotation.y, false, delta)
		return
	if _fell_through():
		push_warning("[player] fell through the world at %.1f,%.1f,%.1f; put back on the ground" % [
				global_position.x, global_position.y, global_position.z])
		_settle()

	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if _talking:
		input_dir = Vector2.ZERO
	if _walk_sweep:
		_walk_t += delta
		input_dir = Vector2.RIGHT.rotated(_walk_t * 0.8)
	elif _walk != Vector2.ZERO:
		input_dir = _walk
	var jump := _afford(Input.is_action_just_pressed("jump"), jump_energy)
	var roll := _afford(Input.is_action_just_pressed("roll") and not _talking, roll_energy)
	var crouch := Input.is_action_pressed("crouch") and not _talking
	var block := Input.is_action_pressed("block") and not _talking
	var direction: Vector3 = rig.wish_direction(input_dir, global_rotation.y)

	if _mantle.update(delta, direction, jump):
		if _sim_id != 0:
			_sim.teleport_character(_sim_id, global_position)
		_report(delta)
		return

	var grounded := _grounded()
	if grounded and velocity.y < 0.0:
		velocity.y = 0.0
	velocity = rig.step_motion(input_dir, jump, crouch, roll, block,
			velocity, global_rotation.y, grounded, get_gravity().y, delta)
	if rig.jumped():
		Game.events.notify(EventNames.PLAYER_JUMPED, global_position)

	_airborne_t = 0.0 if grounded else _airborne_t + delta

	if _sim_id != 0:
		_sim.move_character(_sim_id, velocity * delta)
		_adopt_blocked_velocity(delta)
	else:
		move_and_slide()
	rig.drive(velocity, global_rotation.y, _airborne_t > COYOTE_TIME, delta)
	_report(delta)


func _afford(wanted: bool, cost: float) -> bool:
	if not wanted:
		return false
	if not Vitals.running():
		return true
	if not Vitals.can_afford(Vitals.PLAYER, Vitals.Pool.ENERGY, cost):
		return false
	Vitals.drain(Vitals.PLAYER, Vitals.Pool.ENERGY, cost)
	return true


func _report(delta: float) -> void:
	if OS.get_environment("Q_MOVE_DEBUG") == "":
		return
	_debug_t += delta
	if _debug_t < 0.5:
		return
	_debug_t = 0.0
	print("[move] at=(%.1f,%.1f,%.1f) floor=%s vy=%+.2f slides=%d anim=%s" % [
			global_position.x, global_position.y, global_position.z,
			str(_grounded()), velocity.y, get_slide_collision_count(),
			rig.debug_state()])
