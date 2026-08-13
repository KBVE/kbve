extends Node3D

## Assembles one creature from a single glb that already carries its own rig and
## clips, and drives it from a state machine of locomotion plus one-shot actions.
##
## Deliberately not character_rig.gd. That file exists to stitch a body and
## attachments onto the Quaternius humanoid rig, retarget a shared 20 MB animation
## library onto it, and blend eight headings against two gaits. A creature pack
## brings its own skeleton, its own baked clips, and no strafe or backpedal
## animation at all, so none of that machinery applies -- what does carry over is
## the shape of STATES, the eased crossfades, and the cel shading, and those are
## shared rather than re-derived.
##
## No foot IK. The mech legs are reverse-joint -- UpperLeg, MidLeg, LowerLeg,
## FootBack -- which is three rotating joints to the ankle and so out of reach of
## the two-bone solver the humanoid uses, and Foot.L/Foot.R are not even in the
## chain: they sit at the armature root as baked IK targets. The clips already
## carry solved leg poses, so on ground this reads correctly with no solve at all.
## Terrain adaptation would need a three-joint solver steered by the rig's own
## PoleTarget bones, which is its own job.

const CelShading := preload("res://src/characters/cel_shading.gd")

@export var body: PackedScene
@export var terrain_path: NodePath
@export var snap_to_terrain := true
## The mech pack already exports facing -Z, unlike the humanoid kit, so this is 0
## here and 180 there. Turning it the humanoid's way puts the boss's back to
## whatever it was aimed at.
@export var facing_offset_deg := 0.0
@export var tint := Color(1, 1, 1)
## Shown on a billboard over the creature. Empty for no plate.
@export var display_name := ""
## Clearance above the top of the mesh, so the plate sits off the head rather than
## at a guessed world height -- the mechs differ by more than a metre in stature.
@export var nameplate_clearance := 0.9
## Plates stop drawing past this, so a far-off creature does not leave a speck of
## unreadable text on the horizon.
@export var nameplate_range := 90.0

## Ground speed the walk and run clips were authored for. Unmeasured: these clips
## are in-place with no root motion, so unlike the humanoid gait table these are
## a guess and the feet will slide until they are probed off the stance foot the
## way tools/gait_probe.gd does it.
@export var walk_speed := 1.6
@export var run_speed := 5.0

## Locomotion is one axis, not a ring, because the pack has no sideways or
## backward clips. Blend positions are the speeds above, so the axis is metres per
## second and the blend point for a speed is the speed itself.
const MOVE_CLIPS := ["Idle", "Walk", "Run"]

## clip is the animation, loop marks the cyclic ones -- the pack imports every
## clip as LOOP_NONE, so an unmarked Idle plays once and freezes. xfade is the
## crossfade into the state and reset whether it restarts on entry, both meaning
## what they do in character_rig. returns_to_move sends the state back to
## locomotion when its clip finishes; death is the one that does not.
const STATES := {
	&"move": {&"clip": "", &"loop": true, &"xfade": 0.22, &"reset": false, &"returns_to_move": false},
	&"jump": {&"clip": "Jump", &"loop": false, &"xfade": 0.10, &"reset": true, &"returns_to_move": true},
	&"punch": {&"clip": "Punch", &"loop": false, &"xfade": 0.07, &"reset": true, &"returns_to_move": true},
	&"kick": {&"clip": "Kick", &"loop": false, &"xfade": 0.07, &"reset": true, &"returns_to_move": true},
	&"shoot": {&"clip": "Shoot", &"loop": false, &"xfade": 0.06, &"reset": true, &"returns_to_move": true},
	&"slash": {&"clip": "SwordSlash", &"loop": false, &"xfade": 0.07, &"reset": true, &"returns_to_move": true},
	&"hit_1": {&"clip": "HitRecieve_1", &"loop": false, &"xfade": 0.05, &"reset": true, &"returns_to_move": true},
	&"hit_2": {&"clip": "HitRecieve_2", &"loop": false, &"xfade": 0.05, &"reset": true, &"returns_to_move": true},
	&"death": {&"clip": "Death", &"loop": false, &"xfade": 0.12, &"reset": true, &"returns_to_move": false},
}

## Attacks a fight can ask for by name, so a behaviour tree does not have to know
## which of them the pack happens to ship.
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

var nameplate: Label3D

var _dead := false
var _speed := 0.0
## Top of the mesh in local space, which is where the nameplate hangs from.
var _height := 0.0


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
	if display_name != "":
		_build_nameplate()
	animation = _find_player(rig)
	if animation == null:
		push_error("creature_rig: no AnimationPlayer in %s" % body.resource_path)
		return
	_mark_loops()
	_build_tree(rig)
	if snap_to_terrain:
		_snap()


## Billboarded so it reads from any angle, and depth-tested so a plate does not
## show through the hill the creature is standing behind.
func _build_nameplate() -> void:
	nameplate = Label3D.new()
	nameplate.text = display_name
	nameplate.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	nameplate.double_sided = true
	# Fixed size so the plate keeps one screen size at any distance. Scaling with
	# distance is what left the far ones as an unreadable speck.
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


func set_display_name(value: String) -> void:
	display_name = value
	if nameplate:
		nameplate.text = value


## The pack ships every clip as LOOP_NONE, including the cycles. Left alone, the
## blend space holds the last frame of Idle forever.
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
	# Cycles of different length blended unsynchronised put a footfall in one
	# against a mid-swing in the other, so the legs stutter across the walk-to-run
	# handover the same way they did on the humanoid's ring.
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

	# Without an entry transition the machine sits on its Start node forever and
	# nothing plays at all, which looks exactly like a missing clip.
	var entry := AnimationNodeStateMachineTransition.new()
	entry.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
	entry.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO
	machine.add_transition("Start", "move", entry)

	for state in STATES:
		if state == &"move":
			continue
		# Into a one-shot the moment it is asked for, and back out under its own
		# steam when the clip ends, so nothing has to time the return by hand.
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


## Rescales playback to the speed the blended clip was authored for, so the feet
## slide as little as the unmeasured authored speeds allow.
func _time_scale() -> float:
	if _speed < 0.05:
		return 1.0
	var expected := walk_speed if _speed <= walk_speed else lerpf(walk_speed, run_speed,
			(_speed - walk_speed) / maxf(run_speed - walk_speed, 0.01))
	return clampf(_speed / maxf(expected, 0.01), 0.6, 1.8)


## Plays a one-shot. Refused once dead, so a corpse cannot be made to swing.
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


## Drops the creature at a spot and settles it onto the ground there. Separate
## from setting position, because the terrain has to be sampled at the new place
## rather than wherever the node happened to start.
func place(at: Vector3) -> void:
	global_position = at
	_snap()


func _snap() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain and terrain.has_method("height_at"):
		global_position.y = terrain.height_at(global_position.x, global_position.z)
