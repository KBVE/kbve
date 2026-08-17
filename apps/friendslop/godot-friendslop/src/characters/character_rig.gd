extends Node3D


@export var body: PackedScene
@export var attachments: Array[PackedScene] = []
@export var worn: Array[StringName] = []
@export var head_only_body: PackedScene
@export var follow_journal := false
@export var weapon_scene: PackedScene
@export var weapon_proxy := ""
@export var terrain_path: NodePath
@export var snap_to_terrain := true
@export var facing_offset_deg := 180.0

@export var skin_color := Color(1, 1, 1)
@export var hair_color := Color(0.214, 0.155, 0.047)

@export var animation_sources: Array[PackedScene] = []
@export var default_animation := ""

@export var locomotion := false
@export var foot_ik := false
@export var takeoff_time := 0.28
@export var landing_time := 0.32
@export var work_cancel_speed := 1.2
@export var work_grace := 0.08
@export var crouch_shift_time := 0.30
@export var slide_enter_time := 0.22
@export var slide_recover_time := 0.30
@export var landing_cancel_speed := 0.5
@export var blend_sharpness := 0.0
@export var time_scale_range := Vector2.ZERO

static var _library_cache: Dictionary = {}

var animation: AnimationPlayer
var tree: AnimationTree
var ik: SkeletonModifier3D
var _worn_meshes: Dictionary = {}
var _worn_ids: Dictionary = {}
var _built_base: PackedScene
var loco := QLocomotion.create()

const IDLE_CLIP := "UAL1/Idle"
const CROUCH_IDLE_CLIP := "UAL1/Crouch_Idle"

const SHIELD_CLIP := "UAL2/Idle_Shield"
const SHIELD_ROOT_BONE := &"Spine"
const SHIELD_LAYERS := [&"move", &"crouch"]

const ROLL_STATES := [&"roll_fwd", &"roll_back", &"roll_left", &"roll_right"]

const JUMP_CHAIN := [
	{"from": "move", "to": "jump_start", "at_end": false, "xfade": 0.08},
	{"from": "crouch", "to": "jump_start", "at_end": false, "xfade": 0.10},
	{"from": "jump_start", "to": "jump", "at_end": false, "xfade": 0.05},
	{"from": "jump_start", "to": "jump_land", "at_end": false, "xfade": 0.08},
	{"from": "jump_start", "to": "move", "at_end": false, "xfade": 0.12},
	{"from": "jump", "to": "jump_land", "at_end": false, "xfade": 0.06},
	{"from": "jump", "to": "move", "at_end": false, "xfade": 0.12},
	{"from": "jump_land", "to": "move", "at_end": false, "xfade": 0.18},
]

const CLIMB_CHAIN := [
	{"from": "move", "to": "climb_low", "at_end": false, "xfade": 0.08},
	{"from": "move", "to": "climb_high", "at_end": false, "xfade": 0.08},
	{"from": "jump", "to": "climb_low", "at_end": false, "xfade": 0.08},
	{"from": "jump", "to": "climb_high", "at_end": false, "xfade": 0.08},
	{"from": "climb_low", "to": "move", "at_end": true, "xfade": 0.15},
	{"from": "climb_high", "to": "move", "at_end": true, "xfade": 0.15},
]

const CROUCH_CHAIN := [
	{"from": "move", "to": "crouch_enter", "at_end": false, "xfade": 0.10},
	{"from": "crouch_enter", "to": "crouch", "at_end": false, "xfade": 0.14},
	{"from": "crouch_enter", "to": "move", "at_end": false, "xfade": 0.12},
	{"from": "crouch", "to": "crouch_exit", "at_end": false, "xfade": 0.10},
	{"from": "crouch_exit", "to": "move", "at_end": false, "xfade": 0.16},
	{"from": "crouch_exit", "to": "crouch", "at_end": false, "xfade": 0.12},
]

const TURN_CHAIN := [
	{"from": "move", "to": "turn_90_l", "at_end": false, "xfade": 0.12},
	{"from": "move", "to": "turn_90_r", "at_end": false, "xfade": 0.12},
	{"from": "move", "to": "turn_180_l", "at_end": false, "xfade": 0.12},
	{"from": "move", "to": "turn_180_r", "at_end": false, "xfade": 0.12},
	{"from": "turn_90_l", "to": "move", "at_end": false, "xfade": 0.16},
	{"from": "turn_90_r", "to": "move", "at_end": false, "xfade": 0.16},
	{"from": "turn_180_l", "to": "move", "at_end": false, "xfade": 0.16},
	{"from": "turn_180_r", "to": "move", "at_end": false, "xfade": 0.16},
]

const ROLL_XFADE := 0.10

static func roll_chain() -> Array:
	var out: Array = []
	for state in ROLL_STATES:
		for from in ["move", "crouch", "crouch_enter"]:
			out.append({"from": from, "to": String(state), "at_end": false, "xfade": ROLL_XFADE})
		out.append({"from": String(state), "to": "move", "at_end": false, "xfade": ROLL_XFADE})
	return out

const SLIDE_STATES := [&"slide_start", &"slide_loop", &"slide_exit"]

static func slide_chain() -> Array:
	return [
		{"from": "move", "to": "slide_start", "at_end": false, "xfade": 0.08},
		{"from": "crouch", "to": "slide_start", "at_end": false, "xfade": 0.08},
		{"from": "slide_start", "to": "slide_loop", "at_end": false, "xfade": 0.10},
		{"from": "slide_loop", "to": "slide_exit", "at_end": false, "xfade": 0.10},
		{"from": "slide_start", "to": "slide_exit", "at_end": false, "xfade": 0.10},
		{"from": "slide_exit", "to": "move", "at_end": false, "xfade": 0.14},
	]

const STATES := {
	&"move": {&"clip": "", &"reset": false, &"ik": 1.0},
	&"crouch": {&"clip": "", &"reset": false, &"ik": 1.0},
	&"roll_fwd": {&"clip": "UAL1/Roll", &"reset": true, &"ik": 0.15},
	&"roll_back": {&"clip": "UAL1/BackFlip", &"reset": true, &"ik": 0.15},
	&"roll_left": {&"clip": "UAL1/Dodge_Left", &"reset": true, &"ik": 0.15},
	&"roll_right": {&"clip": "UAL1/Dodge_Right", &"reset": true, &"ik": 0.15},
	&"crouch_enter": {&"clip": "UAL1/Crouch_Enter", &"reset": true, &"ik": 0.9},
	&"crouch_exit": {&"clip": "UAL1/Crouch_Exit", &"reset": true, &"ik": 0.9},
	&"jump_start": {&"clip": "UAL1/Jump_Start", &"reset": true, &"ik": 0.4},
	&"jump": {&"clip": "UAL1/Jump", &"reset": true, &"ik": 0.0},
	&"jump_land": {&"clip": "UAL1/Jump_Land", &"reset": true, &"ik": 0.7},
	&"climb_low": {&"clip": "UAL2/ClimbUp_1m", &"reset": true, &"ik": 0.0},
	&"climb_high": {&"clip": "UAL2/ClimbUp_2m", &"reset": true, &"ik": 0.0},
	&"turn_90_l": {&"clip": "UAL1/Turn90_L", &"reset": true, &"ik": 1.0},
	&"turn_90_r": {&"clip": "UAL1/Turn90_R", &"reset": true, &"ik": 1.0},
	&"turn_180_l": {&"clip": "UAL2/Turn180_L", &"reset": true, &"ik": 1.0},
	&"turn_180_r": {&"clip": "UAL2/Turn180_R", &"reset": true, &"ik": 1.0},
	&"chop": {&"clip": "UAL2/TreeChopping", &"reset": true, &"ik": 1.0},
	&"mine": {&"clip": "UAL2/Mining", &"reset": true, &"ik": 1.0},
	&"slide_start": {&"clip": "UAL2/Slide_Start", &"reset": true, &"ik": 0.2},
	&"slide_loop": {&"clip": "UAL2/Slide", &"reset": true, &"ik": 0.0},
	&"slide_exit": {&"clip": "UAL2/Slide_Exit", &"reset": true, &"ik": 0.6},
}

const WORK_STATES := [&"chop", &"mine"]

static func work_chain() -> Array:
	var out: Array = []
	for state in WORK_STATES:
		out.append({"from": "move", "to": String(state), "at_end": false, "xfade": 0.12})
		out.append({"from": String(state), "to": "move", "at_end": false, "xfade": 0.18})
	return out

const FITTED := {
	&"jump_start": &"takeoff_time",
	&"jump_land": &"landing_time",
	&"crouch_enter": &"crouch_shift_time",
	&"crouch_exit": &"crouch_shift_time",
	&"slide_start": &"slide_enter_time",
	&"slide_exit": &"slide_recover_time",
}

const SHOT_NEXT := {
	&"jump_start": &"jump",
	&"crouch_enter": &"crouch",
	&"crouch_exit": &"move",
	&"slide_start": &"slide_loop",
	&"slide_exit": &"move",
}

const STANCE_STATES := {
	QLocomotion.STANCE_MOVE: &"move",
	QLocomotion.STANCE_JUMP: &"jump",
	QLocomotion.STANCE_CLIMB_LOW: &"climb_low",
	QLocomotion.STANCE_CLIMB_HIGH: &"climb_high",
	QLocomotion.STANCE_CROUCH: &"crouch",
	QLocomotion.STANCE_ROLL: &"roll_fwd",
	QLocomotion.STANCE_LAND: &"jump_land",
	QLocomotion.STANCE_TURN_90_LEFT: &"turn_90_l",
	QLocomotion.STANCE_TURN_90_RIGHT: &"turn_90_r",
	QLocomotion.STANCE_TURN_180_LEFT: &"turn_180_l",
	QLocomotion.STANCE_TURN_180_RIGHT: &"turn_180_r",
	QLocomotion.STANCE_SLIDE: &"slide_start",
}

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

const GAIT_CLIPS := [
	{"radius": 1.0, "prefix": "UAL2/Walk_", "side": {"L": "L", "R": "R"}},
	{"radius": 2.0, "prefix": "UAL1/Jog_", "side": {"L": "Left", "R": "Right"}},
]

const CROUCH_GAIT_CLIPS := [
	{"radius": 1.0, "prefix": "UAL1/Crouch_", "side": {"L": "Left", "R": "Right"}},
]

static func clip_usage() -> Dictionary:
	var out := {}
	for gaits in [[GAIT_CLIPS, "walk / jog ring"], [CROUCH_GAIT_CLIPS, "crouch ring"]]:
		for gait in gaits[0]:
			for entry in RING:
				var suffix: String = entry[1]
				if gait.side.has(suffix):
					suffix = gait.side[suffix]
				out[gait.prefix + suffix] = gaits[1]
	out[IDLE_CLIP] = "walk / jog ring, standing"
	out[CROUCH_IDLE_CLIP] = "crouch ring, standing"
	out[SHIELD_CLIP] = "guard, layered over the upper body"
	for state in STATES:
		var clip: String = STATES[state].clip
		if clip != "":
			out[clip] = "state '%s'" % state
	return out


const CelShading := preload("res://src/characters/cel_shading.gd")

const SHADING := {
	&"MI_Hair_1": {&"tint": &"hair_color"},
	&"MI_Hair_2": {&"tint": &"hair_color"},
	&"MI_Eyes": {&"lit": true},
	&"MI_Regular_Male": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Regular_Female": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Teen_Male": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Teen_Female": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Superhero_Male": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Superhero_Female": {&"tint": &"skin_color", &"body": true, &"sat": 0.7},
	&"MI_Knight": {&"body": true},
	&"MI_Noble": {&"body": true},
	&"MI_Peasant": {&"body": true},
	&"MI_Ranger": {&"body": true},
	&"MI_Wizard": {&"body": true},
}

var skeleton: Skeleton3D
var mount: SkeletonModifier3D

var _shot: StringName = &""
var _shot_t := 0.0
var _work: StringName = &""
var _work_t := 0.0


func _ready() -> void:
	if body == null:
		return
	var base := _base_body()
	_built_base = base
	var rig := base.instantiate() as Node3D
	add_child(rig)
	rig.rotate_y(deg_to_rad(facing_offset_deg))
	skeleton = _find_skeleton(rig)
	if skeleton == null:
		push_error("character_rig: no Skeleton3D in %s" % base.resource_path)
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
	for id in worn:
		equip(id)
	if follow_journal and not Journal.wearing_changed.is_connected(wear_set):
		Journal.wearing_changed.connect(wear_set)
	if follow_journal:
		wear_set(Journal.wearing())
	_build_animation(rig)
	if foot_ik:
		_build_foot_ik()
	_build_weapon()
	if snap_to_terrain:
		_snap()


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
	machine.add_node("move", _guarded(_ring(GAIT_CLIPS, IDLE_CLIP, 2.2), rig))
	machine.add_node("crouch", _guarded(_ring(CROUCH_GAIT_CLIPS, CROUCH_IDLE_CLIP, 1.2), rig))
	for state in STATES:
		var clip: String = STATES[state].clip
		if clip != "":
			var node := _clip(clip)
			if node:
				machine.add_node(state, _rescaled(node))
	for link in JUMP_CHAIN + CLIMB_CHAIN + CROUCH_CHAIN + roll_chain() + TURN_CHAIN \
			+ work_chain() + slide_chain():
		if not machine.has_node(link.from) or not machine.has_node(link.to):
			continue
		machine.add_transition(link.from, link.to, _transition(link))

	tree = AnimationTree.new()
	tree.tree_root = machine
	rig.add_child(tree)
	tree.anim_player = tree.get_path_to(animation)
	tree.active = true
	loco.set_landing(landing_time, landing_cancel_speed)
	for state in FITTED:
		_fit(state, window_for(state))
	for state in ROLL_STATES:
		_fit(state, window_for(state))


func window_for(state: StringName) -> float:
	if FITTED.has(state):
		return get(FITTED[state])
	if ROLL_STATES.has(state):
		return loco.roll_time()
	return 0.0


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


func _rescaled(inner: AnimationNode) -> AnimationNodeBlendTree:
	var tree_node := AnimationNodeBlendTree.new()
	tree_node.add_node("space", inner)
	tree_node.add_node("scale", AnimationNodeTimeScale.new())
	tree_node.connect_node("scale", 0, "space")
	tree_node.connect_node("output", 0, "scale")
	return tree_node


func _guarded(inner: AnimationNode, rig: Node3D) -> AnimationNodeBlendTree:
	var shield := _clip(SHIELD_CLIP)
	var tracks := upper_body_tracks(rig)
	if shield == null or tracks.is_empty():
		return _rescaled(inner)
	var blend := AnimationNodeBlend2.new()
	blend.filter_enabled = true
	for path in tracks:
		blend.set_filter_path(path, true)
	var tree_node := AnimationNodeBlendTree.new()
	tree_node.add_node("space", inner)
	tree_node.add_node("scale", AnimationNodeTimeScale.new())
	tree_node.add_node("guard", shield)
	tree_node.add_node("shield", blend)
	tree_node.connect_node("scale", 0, "space")
	tree_node.connect_node("shield", 0, "scale")
	tree_node.connect_node("shield", 1, "guard")
	tree_node.connect_node("output", 0, "shield")
	return tree_node


func upper_body_tracks(rig: Node3D) -> PackedStringArray:
	var out := PackedStringArray()
	if skeleton == null:
		return out
	var start := skeleton.find_bone(SHIELD_ROOT_BONE)
	if start < 0:
		return out
	var base := String(rig.get_path_to(skeleton))
	var stack: Array[int] = [start]
	while not stack.is_empty():
		var bone: int = stack.pop_back()
		out.append("%s:%s" % [base, skeleton.get_bone_name(bone)])
		for child in skeleton.get_bone_children(bone):
			stack.append(child)
	return out


func _fit(state: StringName, window: float) -> void:
	var clip: String = STATES.get(state, {}).get(&"clip", "")
	if window <= 0.0 or clip == "" or not animation.has_animation(clip):
		return
	tree.set("parameters/%s/scale/scale" % state, animation.get_animation(clip).length / window)


static var _curve: Curve


static func _fade_curve() -> Curve:
	if _curve == null:
		_curve = Curve.new()
		_curve.add_point(Vector2(0.0, 0.0), 0.0, 0.0)
		_curve.add_point(Vector2(1.0, 1.0), 0.0, 0.0)
	return _curve


func _clip(name: String) -> AnimationNodeAnimation:
	if not animation.has_animation(name):
		push_warning("character_rig: no animation '%s'" % name)
		return null
	var node := AnimationNodeAnimation.new()
	node.animation = name
	return node


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


func wish_direction(input_dir: Vector2, yaw: float) -> Vector3:
	return loco.wish_direction(Vector2(input_dir.x, -input_dir.y), yaw)


func step_motion(input_dir: Vector2, jump: bool, crouch: bool, roll: bool, block: bool,
		velocity: Vector3, yaw: float, grounded: bool, gravity_y: float,
		delta: float) -> Vector3:
	return loco.step_motion(Vector2(input_dir.x, -input_dir.y), jump, crouch, roll, block,
			velocity, yaw, grounded, gravity_y, delta)


func jumped() -> bool:
	return loco.jumped()


func debug_state() -> String:
	if tree == null:
		return "no tree"
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	return "%s travel=%s" % [playback.get_current_node(),
			",".join(Array(playback.get_travel_path()).map(func(n): return str(n)))]


func drive(world_velocity: Vector3, aim_yaw: float, airborne: bool, delta: float) -> void:
	if tree == null:
		return
	global_rotation.y = loco.face(world_velocity, aim_yaw, delta)
	set_locomotion(global_transform.basis.inverse() * world_velocity, airborne, delta)


func set_locomotion(local_velocity: Vector3, airborne: bool, delta: float) -> void:
	if tree == null:
		return
	loco.step(local_velocity, airborne, delta)
	tree.set("parameters/move/space/blend_position", loco.blend())
	tree.set("parameters/crouch/space/blend_position", loco.crouch_blend())
	var scale := loco.time_scale()
	tree.set("parameters/move/scale/scale", scale)
	tree.set("parameters/crouch/scale/scale", scale)
	var guard := loco.block_weight()
	for layer in SHIELD_LAYERS:
		tree.set("parameters/%s/shield/blend_amount" % layer, guard)
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	if ik:
		ik.set_ground_weight(_ground_weight(playback))
	if loco.is_climbing():
		return
	if _hold_work(playback, local_velocity, airborne, delta):
		return
	if _hold_shot(playback, delta):
		return
	var want: StringName = _wanted(playback)
	if playback.get_travel_path().is_empty() and playback.get_current_node() != want:
		_fit_turn(want)
		playback.travel(want)


func _fit_turn(state: StringName) -> void:
	var window := loco.turn_window()
	if window <= 0.0 or not STATES.has(state):
		return
	var clip: String = STATES[state].clip
	if clip == "" or not animation.has_animation(clip):
		return
	tree.set("parameters/%s/scale/scale" % state, animation.get_animation(clip).length / window)


func _wanted(playback: AnimationNodeStateMachinePlayback) -> StringName:
	var stance: int = loco.stance()
	if stance == QLocomotion.STANCE_ROLL:
		return ROLL_STATES[clampi(loco.roll_variant(), 0, ROLL_STATES.size() - 1)]
	var want: StringName = STANCE_STATES[stance]
	var current: StringName = playback.get_current_node()
	if stance == QLocomotion.STANCE_SLIDE:
		return current if current == &"slide_loop" else want
	if want == &"move" and (current == &"slide_start" or current == &"slide_loop"):
		return &"slide_exit"
	return want


func play_action(action: StringName, seconds: float) -> void:
	if tree == null or animation == null or not STATES.has(action):
		return
	var clip: String = STATES[action].clip
	if clip == "" or not animation.has_animation(clip):
		return
	var window := maxf(seconds, 0.05)
	_work = action
	_work_t = window + work_grace
	tree.set("parameters/%s/scale/scale" % action,
			animation.get_animation(clip).length / window)


func _hold_work(playback: AnimationNodeStateMachinePlayback, local_velocity: Vector3,
		airborne: bool, delta: float) -> bool:
	if _work_t <= 0.0:
		return false
	_work_t -= delta
	if airborne or loco.stance() != QLocomotion.STANCE_MOVE \
			or Vector2(local_velocity.x, local_velocity.z).length() > work_cancel_speed:
		_work_t = 0.0
		return false
	if playback.get_travel_path().is_empty() and playback.get_current_node() != _work:
		playback.travel(_work)
	return true


func _hold_shot(playback: AnimationNodeStateMachinePlayback, delta: float) -> bool:
	var current: StringName = playback.get_current_node()
	if current != _shot:
		_shot = current
		_shot_t = window_for(current) if SHOT_NEXT.has(current) else 0.0
	if _shot_t <= 0.0:
		return false
	_shot_t -= delta
	if _shot_t > 0.0:
		return true
	playback.travel(SHOT_NEXT[current])
	return true


func _ground_weight(playback: AnimationNodeStateMachinePlayback) -> float:
	var length := playback.get_fading_length()
	var at := 1.0 if length <= 0.0 else playback.get_fading_position() / length
	return ground_weight_for(playback.get_current_node(),
			playback.get_fading_from_node(), at)


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


func _base_body() -> PackedScene:
	if head_only_body == null:
		return body
	var slots: Array = []
	for id: StringName in worn:
		var slot := Wardrobe.slot_of(id)
		if slot != &"":
			slots.append(slot)
	return head_only_body if Wardrobe.covers_the_body(slots) else body


func equip(id: StringName) -> bool:
	if skeleton == null or not Wardrobe.has(id):
		if skeleton != null:
			push_warning("character_rig: nothing in the wardrobe called '%s'" % id)
		return false
	var slot := Wardrobe.slot_of(id)
	if _worn_ids.get(slot, &"") == id:
		return true
	unequip(slot)
	var scene: PackedScene = load(Wardrobe.path_of(id))
	var grafted := _attach(scene)
	if grafted.is_empty():
		return false
	for mesh in grafted:
		CelShading.apply(mesh, SHADING, self)
	_worn_meshes[slot] = grafted
	_worn_ids[slot] = id
	return true


func unequip(slot: StringName) -> void:
	var grafted: Array = _worn_meshes.get(slot, [])
	for mesh: Variant in grafted:
		if is_instance_valid(mesh):
			(mesh as Node).queue_free()
	_worn_meshes.erase(slot)
	_worn_ids.erase(slot)


func wear_set(slots: Dictionary) -> void:
	worn = _ids_of(slots)
	if skeleton == null:
		return
	if _base_body() != _built_base:
		_rebuild()
		return
	for slot: Variant in _worn_ids.keys():
		if not slots.has(slot):
			unequip(slot)
	for slot: Variant in slots:
		equip(StringName(slots[slot]))


func _ids_of(slots: Dictionary) -> Array[StringName]:
	var out: Array[StringName] = []
	for slot: Variant in slots:
		out.append(StringName(slots[slot]))
	return out


func _rebuild() -> void:
	_worn_meshes.clear()
	_worn_ids.clear()
	skeleton = null
	animation = null
	tree = null
	ik = null
	mount = null
	_shot = &""
	_shot_t = 0.0
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_ready()


func wearing() -> Dictionary:
	return _worn_ids.duplicate()


func worn_in(slot: StringName) -> StringName:
	return _worn_ids.get(slot, &"")


func _attach(scene: PackedScene) -> Array[MeshInstance3D]:
	var grafted: Array[MeshInstance3D] = []
	if scene == null:
		return grafted
	var inst := scene.instantiate()
	var src := _find_skeleton(inst)
	if src == null:
		push_error("character_rig: no Skeleton3D in %s" % scene.resource_path)
		inst.free()
		return grafted
	if src.get_bone_count() != skeleton.get_bone_count():
		push_error("character_rig: bone count %d != %d for %s" % [
				src.get_bone_count(), skeleton.get_bone_count(), scene.resource_path])
		inst.free()
		return grafted
	for child in src.get_children():
		if child is not MeshInstance3D:
			continue
		src.remove_child(child)
		child.owner = null
		skeleton.add_child(child)
		(child as MeshInstance3D).skeleton = NodePath("..")
		grafted.append(child)
	inst.free()
	return grafted


func _snap() -> void:
	var terrain := get_node_or_null(terrain_path)
	if terrain and terrain.has_method("height_at"):
		position.y = terrain.height_at(global_position.x, global_position.z)
