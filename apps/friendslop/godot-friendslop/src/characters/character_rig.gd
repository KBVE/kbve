extends Node3D

## Assembles one character from a body glb plus optional attachment glbs.
##
## Every piece in the Quaternius kit skins to the same 65-joint rig in the same
## order, so an attachment's meshes can be reparented onto the body's Skeleton3D
## and keep their existing Skin. Only the body's skeleton survives; the
## attachment scene is discarded once its meshes are taken.

@export var body: PackedScene
@export var attachments: Array[PackedScene] = []
## Weapon held in the main hand. A scene wins if both are set; the proxy name is
## one of weapon_proxy.gd's stand-ins, for working before the art lands.
@export var weapon_scene: PackedScene
@export var weapon_proxy := ""
@export var terrain_path: NodePath
@export var snap_to_terrain := true
## The kit exports with the character facing +Z; Godot's forward is -Z.
@export var facing_offset_deg := 180.0

## The kit's own materials multiply their base map by a colour parameter, which
## the glTF importer drops, so it is fed back in as the cel shader's albedo_tint.
## The body map already carries a skin tone, so white leaves it as authored and
## the tint is there to shift it; the hair map is closer to neutral and needs one.
@export var skin_color := Color(1, 1, 1)
@export var hair_color := Color(0.214, 0.155, 0.047)

## Universal Animation Library glbs. Both carry the same rig as the character
## kit and are retargeted onto the same humanoid profile at import, so their
## tracks resolve against this skeleton without rewriting.
@export var animation_sources: Array[PackedScene] = []
@export var default_animation := ""

## Builds a directional blend space so movement direction picks the clip, rather
## than a forward walk playing while the character strafes.
@export var locomotion := false
@export var foot_ik := false
## Left at 0 to keep QLocomotion's own defaults. Set either to override the gait
## tuning for this character, which is how an NPC gets a different top speed
## without a second copy of the table.
@export var blend_sharpness := 0.0
## Playback is rescaled to the ground speed the clip was authored for. Outside
## this range the correction reads worse than the slide it fixes.
@export var time_scale_range := Vector2.ZERO

## One instantiate of a 20 MB library per run, not per character.
static var _library_cache: Dictionary = {}

var animation: AnimationPlayer
var tree: AnimationTree
var ik: SkeletonModifier3D
## Gait and stance decisions, which are simulation rather than presentation and
## so live in Q where the authoritative server can reach the same answers. This
## file consumes what it decides; see src/locomotion in the q crate.
var loco := QLocomotion.create()

const IDLE_CLIP := "UAL1/Idle"

## Take-off and landing are one-shots either side of the airborne loop. The
## graph is walked by travel(), so airborne only ever asks for "jump" and
## grounded for "move"; the crouch and the recovery come from the states in
## between rather than from anything driving them frame by frame.
const JUMP_CHAIN := [
	{"from": "move", "to": "jump_start", "at_end": false, "xfade": 0.08},
	{"from": "jump_start", "to": "jump", "at_end": true, "xfade": 0.05},
	{"from": "jump", "to": "jump_land", "at_end": false, "xfade": 0.06},
	{"from": "jump_land", "to": "move", "at_end": true, "xfade": 0.18},
]

## A climb can start from standing or from mid-air, and always ends on the
## ground, so it hangs off both ends of the jump chain.
const CLIMB_CHAIN := [
	{"from": "move", "to": "climb_low", "at_end": false, "xfade": 0.08},
	{"from": "move", "to": "climb_high", "at_end": false, "xfade": 0.08},
	{"from": "jump", "to": "climb_low", "at_end": false, "xfade": 0.08},
	{"from": "jump", "to": "climb_high", "at_end": false, "xfade": 0.08},
	{"from": "climb_low", "to": "move", "at_end": true, "xfade": 0.15},
	{"from": "climb_high", "to": "move", "at_end": true, "xfade": 0.15},
]

## What each state wants out of a transition into it.
##
## reset says whether entering restarts the state's clip. Godot defaults this on,
## which is right for the one-shots and wrong for move: every landing dropped the
## locomotion cycle back to frame 0, so the legs cut out of whatever stride they
## were in. Resuming instead lets the cyclic sync in the blend space carry the
## phase through the jump.
##
## ik is how much of the leg solve the state hands to the ground. There is nothing
## to stand on in the air, and a take-off crouch or a landing recovery is only
## partly weight-bearing, so neither should be planted as hard as a walk.
## clip is the animation the state plays, empty for move because the blend space
## picks its own. Two heights of climb, so a hop onto a rock and a haul over a
## fence are not the same clip stretched; which one plays is QLocomotion's call
## from how far the body rises, and the clip's own length is what the movement is
## timed to rather than the animation being scaled to a made-up duration.
const STATES := {
	&"move": {&"clip": "", &"reset": false, &"ik": 1.0},
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
}

## Unit ring, counter-clockwise from forward. x is right, y is forward.
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

## The two libraries disagree on the pure-sideways names: walk uses L/R, jog
## spells them out. Everything else differs only by the gait prefix. The ring
## radii and the ground speeds behind them are QLocomotion::GAITS, so the layout
## here and the solve there cannot drift apart.
const GAIT_CLIPS := [
	{"radius": 1.0, "prefix": "UAL2/Walk_", "side": {"L": "L", "R": "R"}},
	{"radius": 2.0, "prefix": "UAL1/Jog_", "side": {"L": "Left", "R": "Right"}},
]

## Per-surface cel shading, keyed by the kit's material name. tint names the
## exported colour the base map is multiplied by, body picks the shader's body
## preset over its cloth one, lit flattens the terminator for surfaces a shadow
## edge should never cross, and sat pulls the skin map's chroma down, because it
## is far more saturated than the greens and browns it stands in front of and
## reads as glowing orange next to them at full strength.
##
## toon.gdshader is not an option here: its brush strokes are positioned from
## VERTEX, which Godot has already skinned by the time the shader runs, so the
## strokes swim across the body as it animates. anime.gdshader carries no
## positional noise and holds still under deformation.
const SHADE_SHADER := preload("res://assets/fx/shaders/anime.gdshader")

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
			_shade(child)
	_build_animation(rig)
	if foot_ik:
		_build_foot_ik()
	_build_weapon()
	if snap_to_terrain:
		_snap()


## Q_WEAPON=greatsword|sword|dagger|mace|spear overrides whatever the scene
## carries, so every grip can be looked at in one run.
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
	# The rays must not hit the body they are cast from.
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
	# Tracks address the skeleton by its scene-unique name, which resolves
	# against the glb root rather than this node.
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
	var space := AnimationNodeBlendSpace2D.new()
	space.auto_triangles = true
	space.min_space = Vector2(-2.2, -2.2)
	space.max_space = Vector2(2.2, 2.2)
	# Walk cycles run 1.33s and jog 0.93s. Blended unsynchronised, a footfall in
	# one lands mid-swing in the other and the legs stutter through every
	# transition. Cyclic sync phase-locks the loops and carries the cycle length
	# across the rings with the blend.
	space.sync = true
	space.sync_mode = AnimationNodeBlendSpace2D.SYNC_MODE_CYCLIC_MUTABLE
	space.add_blend_point(_clip(IDLE_CLIP), Vector2.ZERO, -1, &"idle")
	for gait in GAIT_CLIPS:
		for entry in RING:
			var dir: Vector2 = entry[0]
			var suffix: String = entry[1]
			if gait.side.has(suffix):
				suffix = gait.side[suffix]
			var clip: String = gait.prefix + suffix
			var node := _clip(clip)
			if node:
				space.add_blend_point(node, dir * gait.radius, -1, StringName(clip.get_file()))

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
	for link in JUMP_CHAIN + CLIMB_CHAIN:
		var t := AnimationNodeStateMachineTransition.new()
		# The one-shots hand over when they finish; the two driven by the
		# controller switch the moment it says so.
		t.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END \
				if link.at_end else AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
		t.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO \
				if link.at_end else AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED
		t.xfade_time = link.xfade
		# Linear crossfades read as a snap at both ends, because the pose leaves
		# the outgoing clip and arrives at the incoming one at full rate. Easing
		# the weight instead means the fade starts and finishes at a standstill.
		t.xfade_curve = _fade_curve()
		t.reset = STATES[link.to].reset
		machine.add_transition(link.from, link.to, t)

	tree = AnimationTree.new()
	tree.tree_root = machine
	rig.add_child(tree)
	tree.anim_player = tree.get_path_to(animation)
	tree.active = true


## One curve shared by every transition, since they all want the same easing.
static var _curve: Curve


static func _fade_curve() -> Curve:
	if _curve == null:
		_curve = Curve.new()
		_curve.add_point(Vector2(0.0, 0.0), 0.0, 0.0)
		_curve.add_point(Vector2(1.0, 1.0), 0.0, 0.0)
	return _curve


## A missing clip is reported rather than silently leaving a hole in the space,
## since a hole shows up as the character sliding in its neighbour's pose.
func _clip(name: String) -> AnimationNodeAnimation:
	if not animation.has_animation(name):
		push_warning("character_rig: no animation '%s'" % name)
		return null
	var node := AnimationNodeAnimation.new()
	node.animation = name
	return node


## Starts the climb that fits `rise` and reports how long it runs, which is the
## span the body has to be moved over for the hands to meet the ledge.
func play_climb(rise: float) -> float:
	if tree == null or animation == null:
		return 0.0
	# Which of the two climbs fits the rise is QLocomotion's call, so the height
	# split is not a number this file and the server can disagree about.
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


## What the state machine is doing, for Q_MOVE_DEBUG. A latched animation and a
## latched airborne flag look identical from outside the rig.
## Top speed for a heading, taking Godot's input vector as it comes: its y is
## positive going backward, and QLocomotion's is positive going forward, so the
## flip between the two frames happens here and nowhere else.
func gait_speed(input_dir: Vector2) -> float:
	return loco.gait_speed(Vector2(input_dir.x, -input_dir.y))


func debug_state() -> String:
	if tree == null:
		return "no tree"
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	return "%s travel=%s" % [playback.get_current_node(),
			",".join(Array(playback.get_travel_path()).map(func(n): return str(n)))]


## local_velocity is in the character's own frame: +x right, +z backward.
##
## Which gait a speed belongs to and how far playback has to be rescaled are
## decided by QLocomotion, not here: they are simulation answers an authoritative
## server has to be able to reach from the same inputs. What is left in this
## file is the half that is presentation -- feeding the blend space, and the
## crossfades and foot solve that hang off the state machine.
func set_locomotion(local_velocity: Vector3, airborne: bool, delta: float) -> void:
	if tree == null:
		return
	loco.step(local_velocity, airborne, delta)
	tree.set("parameters/move/space/blend_position", loco.blend())
	tree.set("parameters/move/scale/scale", loco.time_scale())
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	if ik:
		ik.set_ground_weight(_ground_weight(playback))
	# Only ever asked for the two ends of the chain: travel() routes through
	# take-off or landing on the way, so a landing plays its recovery instead of
	# cutting from a mid-air pose straight into idle. A latched climb is already
	# travelling, so it is left to finish.
	if loco.is_climbing():
		return
	var want: StringName = STANCE_STATES[loco.stance()]
	if playback.get_travel_path().is_empty() and playback.get_current_node() != want:
		playback.travel(want)


## Leg solve weight for the pose that is actually on the skeleton. Mid-transition
## that pose is a blend of two states and matches neither, so the weight is read
## off the same fade the animation is using rather than from the controller's
## airborne flag. A flag flips a frame before the pose it describes exists, which
## is what re-planted the feet onto a pose still half way out of the air.
func _ground_weight(playback: AnimationNodeStateMachinePlayback) -> float:
	var length := playback.get_fading_length()
	var at := 1.0 if length <= 0.0 else playback.get_fading_position() / length
	return ground_weight_for(playback.get_current_node(),
			playback.get_fading_from_node(), at)


## Split from the playback so the curve can be checked without a live tree. `at`
## is how far the crossfade has run, 0 at the outgoing pose and 1 at the incoming.
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


func _shade(mi: MeshInstance3D) -> void:
	if mi.mesh == null:
		return
	for i in mi.mesh.get_surface_count():
		var src := mi.mesh.surface_get_material(i) as BaseMaterial3D
		if src == null:
			continue
		var cfg: Dictionary = SHADING.get(src.resource_name, {})
		if cfg.is_empty():
			push_warning("character_rig: no shading for material %s" % src.resource_name)
			continue
		# The imported material is shared by every instance of the glb, so the cel
		# material is set as a surface override or every character changes together.
		var own := ShaderMaterial.new()
		own.resource_name = src.resource_name
		own.shader = SHADE_SHADER
		if src.albedo_texture:
			own.set_shader_parameter(&"albedo_tex", src.albedo_texture)
		var tint: StringName = cfg.get(&"tint", &"")
		var color: Color = get(tint) if tint != &"" else Color.WHITE
		own.set_shader_parameter(&"albedo_tint", Vector3(color.r, color.g, color.b))
		own.set_shader_parameter(&"body_shadows", cfg.get(&"body", false))
		own.set_shader_parameter(&"albedo_sat", cfg.get(&"sat", 1.0))
		if cfg.get(&"lit", false):
			own.set_shader_parameter(&"shadow_threshold", 0.0)
		mi.set_surface_override_material(i, own)


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
