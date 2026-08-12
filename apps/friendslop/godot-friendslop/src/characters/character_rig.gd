extends Node3D

## Assembles one character from a body glb plus optional attachment glbs.
##
## Every piece in the Quaternius kit skins to the same 65-joint rig in the same
## order, so an attachment's meshes can be reparented onto the body's Skeleton3D
## and keep their existing Skin. Only the body's skeleton survives; the
## attachment scene is discarded once its meshes are taken.

@export var body: PackedScene
@export var attachments: Array[PackedScene] = []
@export var terrain_path: NodePath
@export var snap_to_terrain := true
## The kit exports with the character facing +Z; Godot's forward is -Z.
@export var facing_offset_deg := 180.0

## The kit's base colour maps are greyscale and its own materials multiply them
## by a colour parameter. Godot's glTF importer builds a StandardMaterial3D with
## a white albedo_color, which is the same multiply with the tint left out, so
## setting it here restores the intended look and makes tone a value not a texture.
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
@export var blend_sharpness := 12.0
## Playback is rescaled to the ground speed the clip was authored for. Outside
## this range the correction reads worse than the slide it fixes.
@export var time_scale_range := Vector2(0.6, 1.8)

## One instantiate of a 20 MB library per run, not per character.
static var _library_cache: Dictionary = {}

var animation: AnimationPlayer
var tree: AnimationTree
var ik: SkeletonModifier3D

const IDLE_CLIP := "UAL1/Idle"
const JUMP_CLIP := "UAL1/Jump"
const JUMP_START_CLIP := "UAL1/Jump_Start"
const JUMP_LAND_CLIP := "UAL1/Jump_Land"

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
## spells them out. Everything else differs only by the gait prefix.
##
## fwd/side are the ground speeds the clips were authored at, read off the root
## motion in the _RM builds of the same libraries. They set both which ring a
## given speed lands on and how far playback has to be rescaled to stop the feet
## sliding. Sideways clips cover barely half the ground the forward ones do.
const GAITS := [
	{"radius": 1.0, "prefix": "UAL2/Walk_", "side": {"L": "L", "R": "R"}, "fwd": 1.01, "lateral": 0.64},
	{"radius": 2.0, "prefix": "UAL1/Jog_", "side": {"L": "Left", "R": "Right"}, "fwd": 5.36, "lateral": 3.21},
]

var _blend := Vector2.ZERO

const TINTS := {
	&"MI_Hair_1": "hair_color",
	&"MI_Regular_Male": "skin_color",
	&"MI_Regular_Female": "skin_color",
	&"MI_Teen_Male": "skin_color",
	&"MI_Teen_Female": "skin_color",
	&"MI_Superhero_Male": "skin_color",
	&"MI_Superhero_Female": "skin_color",
}

var skeleton: Skeleton3D


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
	for scene in attachments:
		_attach(scene)
	for child in skeleton.get_children():
		if child is MeshInstance3D:
			_tint(child)
	_build_animation(rig)
	if foot_ik:
		_build_foot_ik()
	if snap_to_terrain:
		_snap()


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
	for gait in GAITS:
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
	machine.add_node("jump", _clip(JUMP_CLIP))
	machine.add_node("jump_start", _clip(JUMP_START_CLIP))
	machine.add_node("jump_land", _clip(JUMP_LAND_CLIP))
	for link in JUMP_CHAIN:
		var t := AnimationNodeStateMachineTransition.new()
		# The one-shots hand over when they finish; the two driven by the
		# controller switch the moment it says so.
		t.switch_mode = AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END \
				if link.at_end else AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE
		t.advance_mode = AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO \
				if link.at_end else AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED
		t.xfade_time = link.xfade
		machine.add_transition(link.from, link.to, t)

	tree = AnimationTree.new()
	tree.tree_root = machine
	rig.add_child(tree)
	tree.anim_player = tree.get_path_to(animation)
	tree.active = true


## A missing clip is reported rather than silently leaving a hole in the space,
## since a hole shows up as the character sliding in its neighbour's pose.
func _clip(name: String) -> AnimationNodeAnimation:
	if not animation.has_animation(name):
		push_warning("character_rig: no animation '%s'" % name)
		return null
	var node := AnimationNodeAnimation.new()
	node.animation = name
	return node


## local_velocity is in the character's own frame: +x right, +z backward.
func set_locomotion(local_velocity: Vector3, airborne: bool, delta: float) -> void:
	if tree == null:
		return
	var flat := Vector2(local_velocity.x, -local_velocity.z)
	var speed := flat.length()
	var dir := flat / speed if speed > 0.001 else Vector2.ZERO
	var radius := _radius_for(speed, dir)
	_blend = _blend.lerp(dir * radius, clampf(blend_sharpness * delta, 0.0, 1.0))
	tree.set("parameters/move/space/blend_position", _blend)
	tree.set("parameters/move/scale/scale", _time_scale(speed, dir, radius))
	# Only ever asked for the two ends of the chain: travel() routes through
	# take-off or landing on the way, so a landing plays its recovery instead of
	# cutting from a mid-air pose straight into idle.
	var playback: AnimationNodeStateMachinePlayback = tree.get("parameters/playback")
	var want := "jump" if airborne else "move"
	if playback.get_travel_path().is_empty() and playback.get_current_node() != want:
		playback.travel(want)
	if ik:
		ik.set_grounded(not airborne)


## Ground speed the blended clip covers in this direction, which is what the
## ring radius has to be solved against.
func _authored(gait: Dictionary, dir: Vector2) -> float:
	return lerpf(gait.lateral, gait.fwd, absf(dir.y))


## Inverse of the ring layout: find the radius whose blended clip is authored
## for this speed, so the gait matches the ground rather than being scaled into
## place. Rings are not evenly spaced in speed, hence the piecewise solve.
func _radius_for(speed: float, dir: Vector2) -> float:
	var slow := _authored(GAITS[0], dir)
	var fast := _authored(GAITS[1], dir)
	if speed <= slow:
		return GAITS[0].radius * (speed / maxf(slow, 0.01))
	var t := (speed - slow) / maxf(fast - slow, 0.01)
	return lerpf(GAITS[0].radius, GAITS[1].radius, clampf(t, 0.0, 1.0))


func _time_scale(speed: float, dir: Vector2, radius: float) -> float:
	if speed < 0.05:
		return 1.0
	var slow := _authored(GAITS[0], dir)
	var fast := _authored(GAITS[1], dir)
	var expected := lerpf(slow, fast, clampf(radius - GAITS[0].radius, 0.0, 1.0))
	return clampf(speed / maxf(expected, 0.01), time_scale_range.x, time_scale_range.y)


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


func _tint(mi: MeshInstance3D) -> void:
	for i in mi.mesh.get_surface_count():
		var mat := mi.mesh.surface_get_material(i)
		if mat == null or not TINTS.has(mat.resource_name):
			continue
		# The imported material is shared by every instance of the glb, so it has
		# to be copied before the tint is applied or all of them change together.
		var own := mat.duplicate() as BaseMaterial3D
		own.albedo_color = get(TINTS[mat.resource_name])
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
