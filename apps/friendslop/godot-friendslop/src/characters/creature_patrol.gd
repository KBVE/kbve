extends Node3D

## Walks a creature between waypoints around a home point, for looking at a rig
## in motion before there is any AI to drive it.
##
## Kinematic on purpose: the position is written directly and settled onto the
## terrain height each frame, rather than going through a body and move_and_slide.
## A creature this size wants a collider shaped to it and a real controller, and
## neither of those is decided yet -- so this stays a driver for looking at
## locomotion, and gets replaced rather than extended when the fight is built.

@export var rig: Node3D
@export var terrain_path: NodePath
## Waypoints are drawn inside this radius of wherever the creature started.
@export var roam_radius := 22.0
@export var arrive_distance := 2.0
## Cruising speed. The rig blends its own clips against this, so it doubles as the
## walk-versus-run choice.
@export var speed := 2.6
@export var turn_rate := 2.5
## Creatures push apart inside this radius. Nothing here collides -- the driver is
## kinematic -- so without it two of them walk into the same patch of ground and
## the meshes interpenetrate, which is the first thing the eye catches.
@export var separation := 9.0
@export var separation_strength := 1.6
## Held still on arrival before picking somewhere new, so it does not read as a
## machine on rails.
@export var pause_range := Vector2(0.8, 2.6)
## Rough seconds between one-shots while moving. Zero to leave them alone.
@export var action_interval := 7.0

var _terrain: Node
var _home := Vector3.ZERO
var _target := Vector3.ZERO
var _pause := 0.0
var _action_t := 0.0


const GROUP := &"creature_patrol"


func _ready() -> void:
	add_to_group(GROUP)
	_home = global_position
	_terrain = get_node_or_null(terrain_path)
	if _terrain == null:
		_terrain = get_tree().current_scene.get_node_or_null("Terrain")
	_action_t = randf_range(action_interval * 0.4, action_interval)
	_pick_target()


func _physics_process(delta: float) -> void:
	if rig == null:
		return
	if rig.has_method("is_dead") and rig.is_dead():
		return

	if _pause > 0.0:
		_pause -= delta
		rig.set_speed(0.0)
		_settle()
		return

	var to := _target - global_position
	to.y = 0.0
	if to.length() <= arrive_distance:
		_pause = randf_range(pause_range.x, pause_range.y)
		_pick_target()
		return

	var dir := to.normalized()
	# Turned toward the heading rather than snapped onto it, so a new waypoint
	# does not spin a thirty-tonne machine on the spot.
	var wanted := atan2(-dir.x, -dir.z)
	rotation.y = lerp_angle(rotation.y, wanted, clampf(turn_rate * delta, 0.0, 1.0))

	# Travelled along where it is actually facing, not where it wants to go, so
	# the feet and the motion agree while it is still coming round.
	var facing := -global_transform.basis.z
	facing.y = 0.0
	var travel := speed * maxf(facing.normalized().dot(dir), 0.0)
	global_position += facing.normalized() * travel * delta
	global_position += _separation() * separation_strength * delta
	rig.set_speed(travel)
	_settle()

	if action_interval > 0.0:
		_action_t -= delta
		if _action_t <= 0.0:
			_action_t = randf_range(action_interval * 0.6, action_interval * 1.4)
			var attacks: Array = rig.ATTACKS
			rig.play_action(attacks[randi() % attacks.size()])


## Sum of the pushes away from every neighbour that is too close, falling off to
## nothing at the separation radius.
func _separation() -> Vector3:
	var push := Vector3.ZERO
	for other in get_tree().get_nodes_in_group(GROUP):
		if other == self:
			continue
		var away: Vector3 = global_position - (other as Node3D).global_position
		away.y = 0.0
		var distance := away.length()
		if distance < 0.001 or distance >= separation:
			continue
		push += away / distance * (1.0 - distance / separation)
	return push


func _settle() -> void:
	if _terrain and _terrain.has_method("height_at"):
		global_position.y = _terrain.height_at(global_position.x, global_position.z)


func _pick_target() -> void:
	var angle := randf() * TAU
	var radius := sqrt(randf()) * roam_radius
	_target = _home + Vector3(cos(angle) * radius, 0.0, sin(angle) * radius)
