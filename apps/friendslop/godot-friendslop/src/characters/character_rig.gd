extends Node3D

## Assembles one character from a body glb plus optional attachment glbs.

@export var body: PackedScene
@export var attachments: Array[PackedScene] = []
## Weapon held in the main hand.
@export var weapon_scene: PackedScene
@export var weapon_proxy := ""
@export var terrain_path: NodePath
@export var snap_to_terrain := true
## The kit exports with the character facing +Z; Godot's forward is -Z.
@export var facing_offset_deg := 180.0

## The kit's own materials multiply their base map by a colour parameter, which the glTF
## importer drops, so it is fed back in as the cel shader's albedo_tint.
@export var skin_color := Color(1, 1, 1)
@export var hair_color := Color(0.214, 0.155, 0.047)

## Universal Animation Library glbs.
@export var animation_sources: Array[PackedScene] = []
@export var default_animation := ""

## Builds a directional blend space so movement direction picks the clip, rather than a
## forward walk playing while the character strafes.
@export var locomotion := false
@export var foot_ik := false
## The kit authors its one-shots far longer than the moments they cover -- the landing
## alone runs 1.27s, which is most of a second of a single pose held while the body is
## already travelling. Each is replayed at whatever rate fits the window it really owns.
@export var takeoff_time := 0.28
@export var landing_time := 0.32
@export var crouch_shift_time := 0.30
## Ground speed that abandons a landing recovery outright.
@export var landing_cancel_speed := 0.5
## Left at 0 to keep QLocomotion's own defaults.
@export var blend_sharpness := 0.0
## Playback is rescaled to the ground speed the clip was authored for.
@export var time_scale_range := Vector2.ZERO

## One instantiate of a 20 MB library per run, not per character.
static var _library_cache: Dictionary = {}

var animation: AnimationPlayer
var tree: AnimationTree
var ik: SkeletonModifier3D
## Gait and stance decisions, which are simulation rather than presentation and so live
## in Q where the authoritative server can reach the same answers.
var loco := QLocomotion.create()

const IDLE_CLIP := "UAL1/Idle"
const CROUCH_IDLE_CLIP := "UAL1/Crouch_Idle"
const ROLL_CLIP := "UAL1/Roll"

## Take-off and landing are one-shots either side of the airborne loop. Both ends carry
## a direct route back to move as well as the chained one: a hop can be over before its
## take-off clip is, and a landing that is walked out of has to be leavable on the frame
## the stick moves rather than when the clip happens to run out.
const JUMP_CHAIN := [
	{"from": "move", "to": "jump_start", "at_end": false, "xfade": 0.08},
	{"from": "crouch", "to": "jump_start", "at_end": false, "xfade": 0.10},
	{"from": "jump_start", "to": "jump", "at_end": true, "xfade": 0.05},
	{"from": "jump_start", "to": "jump_land", "at_end": false, "xfade": 0.08},
	{"from": "jump_start", "to": "move", "at_end": false, "xfade": 0.12},
	{"from": "jump", "to": "jump_land", "at_end": false, "xfade": 0.06},
	{"from": "jump", "to": "move", "at_end": false, "xfade": 0.12},
	{"from": "jump_land", "to": "move", "at_end": false, "xfade": 0.18},
]

## A climb can start from standing or from mid-air, and always ends on the ground, so it
## hangs off both ends of the jump chain.
const CLIMB_CHAIN := [
	{"from": "move", "to": "climb_low", "at_end": false, "xfade": 0.08},
	{"from": "move", "to": "climb_high", "at_end": false, "xfade": 0.08},
	{"from": "jump", "to": "climb_low", "at_end": false, "xfade": 0.08},
	{"from": "jump", "to": "climb_high", "at_end": false, "xfade": 0.08},
	{"from": "climb_low", "to": "move", "at_end": true, "xfade": 0.15},
	{"from": "climb_high", "to": "move", "at_end": true, "xfade": 0.15},
]

## Crouching is entered and left through one-shots, so the body folds down rather than
## cross-fading into a pose it never took.
const CROUCH_CHAIN := [
	{"from": "move", "to": "crouch_enter", "at_end": false, "xfade": 0.10},
	{"from": "crouch_enter", "to": "crouch", "at_end": true, "xfade": 0.14},
	{"from": "crouch_enter", "to": "move", "at_end": false, "xfade": 0.12},
	{"from": "crouch", "to": "crouch_exit", "at_end": false, "xfade": 0.10},
	{"from": "crouch_exit", "to": "move", "at_end": true, "xfade": 0.16},
	{"from": "crouch_exit", "to": "crouch", "at_end": false, "xfade": 0.12},
]

## A roll can be thrown from either stance and always ends standing.
const ROLL_CHAIN := [
	{"from": "move", "to": "roll", "at_end": false, "xfade": 0.07},
	{"from": "crouch", "to": "roll", "at_end": false, "xfade": 0.07},
	{"from": "crouch_enter", "to": "roll", "at_end": false, "xfade": 0.07},
	{"from": "roll", "to": "move", "at_end": true, "xfade": 0.18},
]

## What each state wants out of a transition into it.
const STATES := {
	&"move": {&"clip": "", &"reset": false, &"ik": 1.0},
	&"crouch": {&"clip": "", &"reset": false, &"ik": 1.0},
	&"roll": {&"clip": "", &"reset": true, &"ik": 0.15},
	&"crouch_enter": {&"clip": "UAL1/Crouch_Enter", &"reset": true, &"ik": 0.9},
	&"crouch_exit": {&"clip": "UAL1/Crouch_Exit", &"reset": true, &"ik": 0.9},
	&"jump_start": {&"clip": "UAL1/Jump_Start", &"reset": true, &"ik": 0.4},
	&"jump": {&"clip": "UAL1/Jump", &"reset": true, &"ik": 0.0},
	&"jump_land": {&"clip": "UAL1/Jump_Land", &"reset": true, &"ik": 0.7},
	&"climb_low": {&"clip": "UAL2/ClimbUp_1m", &"reset": true, &"ik": 0.0},
	&"climb_high": {&"clip": "UAL2/ClimbUp_2m", &"reset": true, &"ik": 0.0},
}

## QLocomotion decides in stances; the state machine is addressed by name.
const STANCE_STATES := {
	QLocomotion.STANCE_MOVE: &"move",
	QLocomotion.STANCE_JUMP: &"jump",
	QLocomotion.STANCE_CLIMB_LOW: &"climb_low",
	QLocomotion.STANCE_CLIMB_HIGH: &"climb_high",
	QLocomotion.STANCE_CROUCH: &"crouch",
	QLocomotion.STANCE_ROLL: &"roll",
	QLocomotion.STANCE_LAND: &"jump_land",
}

## Unit ring, counter-clockwise from forward.
const RING := [
	[Vector2(0, 1), "Fwd"],
	[Vector2(0.707, 0.707), "Fwd_R"],
	[Vector2(1, 0), "R"],
	[Vector2(0.707, -0.707), "Bwd_R"],
	[Vector2(0, -1), "Bwd"],
	[Vector2(-0.707, -0.707), "Bwd_L"],
	[Vector2(-1, 0), "L"],
	[Vector2(-0.707, 0.707), "Fwd_L"],
]

## The two libraries disagree on the pure-sideways names: walk uses L/R, jog spells them
## out.
const GAIT_CLIPS := [
	{"radius": 1.0, "prefix": "UAL2/Walk_", "side": {"L": "L", "R": "R"}},
	{"radius": 2.0, "prefix": "UAL1/Jog_", "side": {"L": "Left", "R": "Right"}},
]

## Crouching has one ring of its own; nothing blends from a crouch to a jog without
## standing up first, so it does not belong on the ladder above.
const CROUCH_GAIT_CLIPS := [
	{"radius": 1.0, "prefix": "UAL1/Crouch_", "side": {"L": "Left", "R": "Right"}},
]

## Per-surface cel shading; see cel_shading.gd for what the fields mean.
const CelShading := preload("res://src/characters/cel_shading.gd")

const SHADING := {
	&"MI_Hair_1": {&"tint": &"hair_color"},
	&"MI_Eyes": {&"lit": true},
	&"MI_Regular_Male": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Regular_Female": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Teen_Male": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Teen_Female": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Superhero_Male": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Superhero_Female": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
}

var skeleton: Skeleton3D
var mount: SkeletonModifier3D


func _ready() -> void:
	if body == null:
		return
	var rig := body.instantiate() as Node3D
	add_child(rig)
	rig.rotate_y(deg_to_rad(facing_offset_deg))
	skeleton = _find_skeleton(rig)
	if skeleton == null:
		push_error("character_rig: no Skeleton3D in %s" % body.resource_path)
		return
	if blend_sharpness > 0.0:
		loco.set_blend_sharpness(blend_sharpness)
	if time_scale_range != Vector2.ZERO:
		loco.set_time_scale_range(time_scale_range.x, time_scale_range.y)
	for scene in attachments:
		_attach(scene)
	for child in skeleton.get_children():
		if child is MeshInstance3D:
			CelShading.apply(child, SHADING, self)
	_build_animation(rig)
	if foot_ik:
		_build_foot_ik()
	_build_weapon()
	if snap_to_terrain:
		_snap()


## Q_WEAPON=greatsword|sword|dagger|mace|spear overrides whatever the scene carries, so
## every grip can be looked at in one run.
func _build_weapon() -> void:
	mount = preload("res://src/characters/weapon_mount.gd").new()
	skeleton.add_child(mount)
	var proxy := OS.get_environment("Q_WEAPON")
	if proxy == "":
		proxy = weapon_proxy
	if weapon_scene and proxy == "":
		mount.equip(weapon_scene)
	elif proxy != "":
		mount.equip_proxy(proxy)


func _build_foot_ik() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain == null or not terrain.has_method("height_at"):
		push_warning("character_rig: foot_ik needs a terrain exposing height_at")
		return
	var mod: SkeletonModifier3D = preload("res://src/characters/foot_ik.gd").new()
	skeleton.add_child(mod)
	var owner_body: Node = self
	while owner_body and owner_body is not PhysicsBody3D:
		owner_body = owner_body.get_parent()
	mod.setup(terrain, owner_body)
	ik = mod


func _build_animation(rig: Node3D) -> void:
	if animation_sources.is_empty():
		return
	animation = AnimationPlayer.new()
	rig.add_child(animation)
	animation.root_node = animation.get_path_to(rig)
	for source in animation_sources:
		if source == null:
			continue
		var lib := _library(source)
		if lib:
			animation.add_animation_library(source.resource_path.get_file().get_basename(), lib)
	if locomotion:
		_build_tree(rig)
		return
	if default_animation == "":
		return
	if animation.has_animation(default_animation):
		animation.play(default_animation)
	else:
		push_warning("character_rig: no animation '%s'" % default_animation)


func _build_tree(rig: Node3D) -> void:
	var machine := AnimationNodeStateMachine.new()
	machine.add_node("move", _rescaled(_ring(GAIT_CLIPS, IDLE_CLIP, 2.2)))
	machine.add_node("crouch", _rescaled(_ring(CROUCH_GAIT_CLIPS, CROUCH_IDLE_CLIP, 1.2)))
	var roll := _clip(ROLL_CLIP)
	if roll:
		machine.add_node("roll", _rescaled(roll))
	for state in STATES:
		var clip: String = STATES[state].clip
		if clip != "":
			var node := _clip(clip)
			if node:
				machine.add_node(state, _rescaled(node))
	for link in JUMP_CHAIN + CLIMB_CHAIN + CROUCH_CHAIN + ROLL_CHAIN:
		if not machine.has_node(link.from) or not machine.has_node(link.to):
			continue
		machine.add_transition(link.from, link.to, _transition(link))

	tree = AnimationTree.new()
	tree.tree_root = machine
	rig.add_child(tree)
	tree.anim_player = tree.get_path_to(animation)
	tree.active = true
	loco.set_landing(landing_time, landing_cancel_speed)
	_fit(&"roll", ROLL_CLIP, loco.roll_time())
	_fit(&"jump_start", STATES[&"jump_start"].clip, takeoff_time)
	_fit(&"jump_land", STATES[&"jump_land"].clip, landing_time)
	_fit(&"crouch_enter", STATES[&"crouch_enter"].clip, crouch_shift_time)
	_fit(&"crouch_exit", STATES[&"crouch_exit"].clip, crouch_shift_time)


## `travel` refuses to path through a disabled transition, so a link that is only ever
## taken by hand still has to be enabled -- what it must not be is AUTO, which would fire
## it the moment the state is entered. Getting this wrong costs the cross-fade entirely:
## with no route to the state asked for, playback hard-cuts to it.
func _transition(link: Dictionary) -> AnimationNodeStateMachineTransition:
	var t := AnimationNodeStateMachineTransition.new()
	t.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END \
			if link.at_end else AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
	t.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO \
			if link.at_end else AnimationNodeStateMachineTransition.ADVANCE_MODE_ENABLED
	t.xfade_time = link.xfade
	t.xfade_curve = _fade_curve()
	t.reset = STATES[link.to].reset
	return t


## A directional ring of clips around an idle at its centre.
func _ring(gaits: Array, idle: String, extent: float) -> AnimationNodeBlendSpace2D:
	var space := AnimationNodeBlendSpace2D.new()
	space.auto_triangles = true
	space.min_space = Vector2(-extent, -extent)
	space.max_space = Vector2(extent, extent)
	space.sync = true
	space.sync_mode = AnimationNodeBlendSpace2D.SYNC_MODE_CYCLIC_MUTABLE
	space.add_blend_point(_clip(idle), Vector2.ZERO, -1, &"idle")
	for gait in gaits:
		for entry in RING:
			var dir: Vector2 = entry[0]
			var suffix: String = entry[1]
			if gait.side.has(suffix):
				suffix = gait.side[suffix]
			var clip: String = gait.prefix + suffix
			var node := _clip(clip)
			if node:
				space.add_blend_point(node, dir * gait.radius, -1, StringName(clip.get_file()))
	return space


## Wraps a node so its playback rate can be driven, at `<state>/scale/scale`.
func _rescaled(inner: AnimationNode) -> AnimationNodeBlendTree:
	var tree_node := AnimationNodeBlendTree.new()
	tree_node.add_node("space", inner)
	tree_node.add_node("scale", AnimationNodeTimeScale.new())
	tree_node.connect_node("scale", 0, "space")
	tree_node.connect_node("output", 0, "scale")
	return tree_node


## A one-shot is authored for however long the kit felt like; what matters is the window
## the simulation gives it. Playing it at the rate that makes the two end together keeps
## the whole clip visible without it outstaying the moment it covers.
func _fit(state: StringName, clip: String, window: float) -> void:
	if window <= 0.0 or not animation.has_animation(clip):
		return
	tree.set("parameters/%s/scale/scale" % state, animation.get_animation(clip).length / window)


## One curve shared by every transition, since they all want the same easing.
static var _curve: Curve


static func _fade_curve() -> Curve:
	if _curve == null:
		_curve = Curve.new()
		_curve.add_point(Vector2(0.0, 0.0), 0.0, 0.0)
		_curve.add_point(Vector2(1.0, 1.0), 0.0, 0.0)
	return _curve


## A missing clip is reported rather than silently leaving a hole in the space, since a
## hole shows up as the character sliding in its neighbour's pose.
func _clip(name: String) -> AnimationNodeAnimation:
	if not animation.has_animation(name):
		push_warning("character_rig: no animation '%s'" % name)
		return null
	var node := AnimationNodeAnimation.new()
	node.animation = name
	return node


## Starts the climb that fits `rise` and reports how long it runs, which is the span the
## body has to be moved over for the hands to meet the ledge.
func play_climb(rise: float) -> float:
	if tree == null or animation == null:
		return 0.0
	var state: StringName = STANCE_STATES[loco.begin_climb(rise)]
	var clip: String = STATES[state].clip
	if not animation.has_animation(clip):
		loco.end_climb()
		return 0.0
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	playback.travel(state)
	return animation.get_animation(clip).length


func end_climb() -> void:
	loco.end_climb()


## What the state machine is doing, for Q_MOVE_DEBUG.
func wish_direction(input_dir: Vector2, yaw: float) -> Vector3:
	return loco.wish_direction(Vector2(input_dir.x, -input_dir.y), yaw)


## Velocity for one tick. `crouch` is held for as long as the stance should last; `roll`
## is the press that starts one, and is ignored until the roll it started has run out.
func step_motion(input_dir: Vector2, jump: bool, crouch: bool, roll: bool,
		velocity: Vector3, yaw: float, grounded: bool, gravity_y: float,
		delta: float) -> Vector3:
	return loco.step_motion(Vector2(input_dir.x, -input_dir.y), jump, crouch, roll,
			velocity, yaw, grounded, gravity_y, delta)


func jumped() -> bool:
	return loco.jumped()


func debug_state() -> String:
	if tree == null:
		return "no tree"
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	return "%s travel=%s" % [playback.get_current_node(),
			",".join(Array(playback.get_travel_path()).map(func(n): return str(n)))]


## local_velocity is in the character's own frame: +x right, +z backward.
func set_locomotion(local_velocity: Vector3, airborne: bool, delta: float) -> void:
	if tree == null:
		return
	loco.step(local_velocity, airborne, delta)
	tree.set("parameters/move/space/blend_position", loco.blend())
	tree.set("parameters/crouch/space/blend_position", loco.crouch_blend())
	var scale := loco.time_scale()
	tree.set("parameters/move/scale/scale", scale)
	tree.set("parameters/crouch/scale/scale", scale)
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	if ik:
		ik.set_ground_weight(_ground_weight(playback))
	if loco.is_climbing():
		return
	var want: StringName = STANCE_STATES[loco.stance()]
	if playback.get_travel_path().is_empty() and playback.get_current_node() != want:
		playback.travel(want)


## Leg solve weight for the pose that is actually on the skeleton.
func _ground_weight(playback: AnimationNodeStateMachinePlayback) -> float:
	var length := playback.get_fading_length()
	var at := 1.0 if length <= 0.0 else playback.get_fading_position() / length
	return ground_weight_for(playback.get_current_node(),
			playback.get_fading_from_node(), at)


## Split from the playback so the curve can be checked without a live tree.
func ground_weight_for(into: StringName, from: StringName, at: float) -> float:
	var arriving: float = STATES.get(into, {}).get(&"ik", 1.0)
	if from == &"":
		return arriving
	var leaving: float = STATES.get(from, {}).get(&"ik", 1.0)
	return lerpf(leaving, arriving, clampf(at, 0.0, 1.0))


func _library(source: PackedScene) -> AnimationLibrary:
	var key := source.resource_path
	if _library_cache.has(key):
		return _library_cache[key]
	var inst := source.instantiate()
	var ap := _find_player(inst)
	var lib: AnimationLibrary = null
	if ap and not ap.get_animation_library_list().is_empty():
		lib = ap.get_animation_library(ap.get_animation_library_list()[0])
	inst.free()
	_library_cache[key] = lib
	return lib


func _find_player(n: Node) -> AnimationPlayer:
	if n is AnimationPlayer:
		return n
	for c in n.get_children():
		var f := _find_player(c)
		if f:
			return f
	return null


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var found := _find_skeleton(c)
		if found:
			return found
	return null


func _attach(scene: PackedScene) -> void:
	if scene == null:
		return
	var inst := scene.instantiate()
	var src := _find_skeleton(inst)
	if src == null:
		push_error("character_rig: no Skeleton3D in %s" % scene.resource_path)
		inst.free()
		return
	if src.get_bone_count() != skeleton.get_bone_count():
		push_error("character_rig: bone count %d != %d for %s" % [
				src.get_bone_count(), skeleton.get_bone_count(), scene.resource_path])
		inst.free()
		return
	for child in src.get_children():
		if child is not MeshInstance3D:
			continue
		src.remove_child(child)
		child.owner = null
		skeleton.add_child(child)
		(child as MeshInstance3D).skeleton = NodePath("..")
	inst.free()


func _snap() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain and terrain.has_method("height_at"):
		position.y = terrain.height_at(global_position.x, global_position.z)
