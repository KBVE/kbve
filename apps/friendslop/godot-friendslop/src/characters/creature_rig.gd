extends Node3D

## Assembles one creature from a single glb that already carries its own rig and clips,
## and drives it from a state machine of locomotion plus one-shot actions.

const CelShading := preload("res://src/characters/cel_shading.gd")

@export var body: PackedScene
@export var terrain_path: NodePath
@export var snap_to_terrain := true
## Plants the feet on the ground the creature is standing on; needs a terrain.
@export var foot_ik := true
## The mech pack exports facing +Z, same as the humanoid kit; Godot's forward is -Z.
@export var facing_offset_deg := 180.0
@export var tint := Color(1, 1, 1)
## Shown on a billboard over the creature.
@export var display_name := ""
## Clearance above the top of the mesh, so the plate sits off the head rather than at a
## guessed world height -- the mechs differ by more than a metre in stature.
@export var nameplate_clearance := 0.9
## Plates stop drawing past this, so a far-off creature does not leave a speck of
## unreadable text on the horizon.
@export var nameplate_range := 90.0

## Ground speed the walk and run clips were authored for.
@export var walk_speed := 1.6
@export var run_speed := 5.0

## Locomotion is one axis, not a ring, because the pack has no sideways or backward
## clips.
const MOVE_CLIPS := ["Idle", "Walk", "Run"]

## clip is the animation, loop marks the cyclic ones -- the pack imports every clip as
## LOOP_NONE, so an unmarked Idle plays once and freezes. ik is how much of the legs the
## state hands to the foot solver, which is none of them wherever the clip takes the feet
## off the ground.
const STATES := {
	&"move": {&"clip": "", &"loop": true, &"xfade": 0.22, &"reset": false, &"returns_to_move": false, &"ik": 1.0},
	&"jump": {&"clip": "Jump", &"loop": false, &"xfade": 0.10, &"reset": true, &"returns_to_move": true, &"ik": 0.0},
	&"punch": {&"clip": "Punch", &"loop": false, &"xfade": 0.07, &"reset": true, &"returns_to_move": true, &"ik": 1.0},
	&"kick": {&"clip": "Kick", &"loop": false, &"xfade": 0.07, &"reset": true, &"returns_to_move": true, &"ik": 0.4},
	&"shoot": {&"clip": "Shoot", &"loop": false, &"xfade": 0.06, &"reset": true, &"returns_to_move": true, &"ik": 1.0},
	&"slash": {&"clip": "SwordSlash", &"loop": false, &"xfade": 0.07, &"reset": true, &"returns_to_move": true, &"ik": 1.0},
	&"hit_1": {&"clip": "HitRecieve_1", &"loop": false, &"xfade": 0.05, &"reset": true, &"returns_to_move": true, &"ik": 0.8},
	&"hit_2": {&"clip": "HitRecieve_2", &"loop": false, &"xfade": 0.05, &"reset": true, &"returns_to_move": true, &"ik": 0.8},
	&"death": {&"clip": "Death", &"loop": false, &"xfade": 0.12, &"reset": true, &"returns_to_move": false, &"ik": 0.0},
}

## Attacks a fight can ask for by name, so a behaviour tree does not have to know which
## of them the pack happens to ship.
const ATTACKS: Array[StringName] = [&"punch", &"kick", &"shoot", &"slash"]

const SHADING := {
	&"George_Texture": {&"tint": &"tint"},
	&"Leela_Texture": {&"tint": &"tint"},
	&"Mike_Texture": {&"tint": &"tint"},
	&"Stan_Texture": {&"tint": &"tint"},
}

static var _curve: Curve

var animation: AnimationPlayer
var tree: AnimationTree
var skeleton: Skeleton3D
var ik: SkeletonModifier3D

var nameplate: Label3D

var _dead := false
var _speed := 0.0
## Top of the mesh in local space, which is where the nameplate hangs from.
var _height := 0.0
var _bounds := AABB()


func _ready() -> void:
	if body == null:
		return
	var rig := body.instantiate() as Node3D
	add_child(rig)
	rig.rotate_y(deg_to_rad(facing_offset_deg))
	skeleton = _find_skeleton(rig)
	if skeleton == null:
		push_error("creature_rig: no Skeleton3D in %s" % body.resource_path)
		return
	for child in skeleton.get_children():
		if child is MeshInstance3D:
			CelShading.apply(child, SHADING, self)
			var box := (child as MeshInstance3D).mesh.get_aabb()
			_height = maxf(_height, box.position.y + box.size.y)
			_bounds = box if _bounds.size == Vector3.ZERO else _bounds.merge(box)
	if display_name != "":
		_build_nameplate()
	animation = _find_player(rig)
	if animation == null:
		push_error("creature_rig: no AnimationPlayer in %s" % body.resource_path)
		return
	_mark_loops()
	_build_tree(rig)
	if foot_ik:
		_build_foot_ik()
	if snap_to_terrain:
		_snap()


func _build_foot_ik() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain == null or not terrain.has_method("height_at"):
		push_warning("creature_rig: foot_ik needs a terrain exposing height_at")
		return
	var mod: SkeletonModifier3D = preload("res://src/characters/creature_foot_ik.gd").new()
	skeleton.add_child(mod)
	var owner_body: Node = self
	while owner_body and owner_body is not PhysicsBody3D:
		owner_body = owner_body.get_parent()
	mod.setup(terrain, owner_body)
	ik = mod


func _process(_delta: float) -> void:
	if ik == null or tree == null:
		return
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	var length := playback.get_fading_length()
	var at := 1.0 if length <= 0.0 else playback.get_fading_position() / length
	ik.set_ground_weight(ground_weight_for(playback.get_current_node(),
			playback.get_fading_from_node(), at))


## Leg solve weight for the pose that is actually on the skeleton.
func ground_weight_for(into: StringName, from: StringName, at: float) -> float:
	var arriving: float = STATES.get(into, {}).get(&"ik", 1.0)
	if from == &"":
		return arriving
	var leaving: float = STATES.get(from, {}).get(&"ik", 1.0)
	return lerpf(leaving, arriving, clampf(at, 0.0, 1.0))


## Billboarded so it reads from any angle, and depth-tested so a plate does not show
## through the hill the creature is standing behind.
func _build_nameplate() -> void:
	nameplate = Label3D.new()
	nameplate.text = display_name
	nameplate.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	nameplate.double_sided = true
	nameplate.fixed_size = true
	nameplate.pixel_size = 0.0004
	nameplate.font_size = 64
	nameplate.outline_size = 20
	nameplate.visibility_range_end = nameplate_range
	nameplate.visibility_range_end_margin = 12.0
	nameplate.modulate = Color(1, 0.93, 0.8)
	nameplate.outline_modulate = Color(0.05, 0.04, 0.08)
	nameplate.position = Vector3(0.0, _height + nameplate_clearance, 0.0)
	add_child(nameplate)


## Combined mesh bounds in local space, for whatever has to size a collider or hang
## something off the top of the creature.
func mesh_extents() -> AABB:
	return _bounds


func set_display_name(value: String) -> void:
	display_name = value
	if nameplate:
		nameplate.text = value


## The pack ships every clip as LOOP_NONE, including the cycles.
func _mark_loops() -> void:
	var cyclic := MOVE_CLIPS.duplicate()
	for state in STATES:
		if STATES[state].loop and STATES[state].clip != "":
			cyclic.append(STATES[state].clip)
	for name in cyclic:
		if animation.has_animation(name):
			animation.get_animation(name).loop_mode = Animation.LOOP_LINEAR


func _build_tree(rig: Node3D) -> void:
	var space := AnimationNodeBlendSpace1D.new()
	space.min_space = 0.0
	space.max_space = run_speed
	space.sync = true
	var at := [0.0, walk_speed, run_speed]
	for i in MOVE_CLIPS.size():
		var node := _clip(MOVE_CLIPS[i])
		if node:
			space.add_blend_point(node, at[i], -1, StringName(MOVE_CLIPS[i]))

	var move := AnimationNodeBlendTree.new()
	move.add_node("space", space)
	move.add_node("scale", AnimationNodeTimeScale.new())
	move.connect_node("scale", 0, "space")
	move.connect_node("output", 0, "scale")

	var machine := AnimationNodeStateMachine.new()
	machine.add_node("move", move)
	for state in STATES:
		var clip: String = STATES[state].clip
		if clip != "":
			machine.add_node(state, _clip(clip))

	var entry := AnimationNodeStateMachineTransition.new()
	entry.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
	entry.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO
	machine.add_transition("Start", "move", entry)

	for state in STATES:
		if state == &"move":
			continue
		_link(machine, &"move", state, false)
		if STATES[state].returns_to_move:
			_link(machine, state, &"move", true)

	tree = AnimationTree.new()
	tree.tree_root = machine
	rig.add_child(tree)
	tree.anim_player = tree.get_path_to(animation)
	tree.active = true


func _link(machine: AnimationNodeStateMachine, from: StringName, to: StringName,
		at_end: bool) -> void:
	var t := AnimationNodeStateMachineTransition.new()
	t.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END \
			if at_end else AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
	t.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO \
			if at_end else AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED
	t.xfade_time = STATES[to].xfade
	t.xfade_curve = _fade_curve()
	t.reset = STATES[to].reset
	machine.add_transition(from, to, t)


static func _fade_curve() -> Curve:
	if _curve == null:
		_curve = Curve.new()
		_curve.add_point(Vector2(0.0, 0.0), 0.0, 0.0)
		_curve.add_point(Vector2(1.0, 1.0), 0.0, 0.0)
	return _curve


func _clip(name: String) -> AnimationNodeAnimation:
	if not animation.has_animation(name):
		push_warning("creature_rig: no animation '%s'" % name)
		return null
	var node := AnimationNodeAnimation.new()
	node.animation = name
	return node


## Ground speed, in metres per second, which is the blend axis directly.
func set_speed(value: float) -> void:
	if tree == null:
		return
	_speed = maxf(value, 0.0)
	tree.set("parameters/move/space/blend_position", _speed)
	tree.set("parameters/move/scale/scale", _time_scale())


## Rescales playback to the speed the blended clip was authored for, so the feet slide
## as little as the unmeasured authored speeds allow.
func _time_scale() -> float:
	if _speed < 0.05:
		return 1.0
	var expected := walk_speed if _speed <= walk_speed else lerpf(walk_speed, run_speed,
			(_speed - walk_speed) / maxf(run_speed - walk_speed, 0.01))
	return clampf(_speed / maxf(expected, 0.01), 0.6, 1.8)


## Plays a one-shot.
func play_action(state: StringName) -> float:
	if tree == null or _dead or not STATES.has(state):
		return 0.0
	var clip: String = STATES[state].clip
	if clip == "" or not animation.has_animation(clip):
		return 0.0
	if state == &"death":
		_dead = true
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	playback.travel(state)
	return animation.get_animation(clip).length


func is_dead() -> bool:
	return _dead


func debug_state() -> String:
	if tree == null:
		return "no tree"
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	return "%s speed=%.2f" % [playback.get_current_node(), _speed]


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var found := _find_skeleton(c)
		if found:
			return found
	return null


func _find_player(n: Node) -> AnimationPlayer:
	if n is AnimationPlayer:
		return n
	for c in n.get_children():
		var found := _find_player(c)
		if found:
			return found
	return null


## Drops the creature at a spot and settles it onto the ground there.
func place(at: Vector3) -> void:
	global_position = at
	_snap()


func _snap() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain and terrain.has_method("height_at"):
		global_position.y = terrain.height_at(global_position.x, global_position.z)
