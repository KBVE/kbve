extends SceneTree

## Measures the ground speed a locomotion clip was authored at, without the root-motion
## build of the library.

const SOURCES := [
	"res://assets/characters/quaternius_ubc/animations/UAL1.glb",
	"res://assets/characters/quaternius_ubc/animations/UAL2.glb",
]
const FEET := [&"LeftFoot", &"RightFoot"]
const STEPS := 160
## How far above its lowest point a foot still counts as planted, as a fraction of that
## foot's own vertical travel in the clip.
const STANCE_BAND := 0.2
## Values from the root-motion builds, kept as a check on the method rather than as an
## input to it: a probe that cannot reproduce these is not to be believed about the
## clips it is being asked about.
const KNOWN := {"Walk_Fwd": 1.01, "Jog_Fwd": 5.36, "Walk_L": 0.64, "Jog_Left": 3.21}


func _initialize() -> void:
	for path in SOURCES:
		var scene: PackedScene = load(path)
		if scene == null:
			print("cannot load ", path)
			continue
		var inst := scene.instantiate()
		root.add_child(inst)
		var player: AnimationPlayer = null
		var skeleton: Skeleton3D = null
		for node in _all(inst):
			if node is AnimationPlayer:
				player = node
			elif node is Skeleton3D:
				skeleton = node
		if player == null or skeleton == null:
			print("no player or skeleton in ", path)
			inst.queue_free()
			continue
		player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
		var bones: Array[int] = []
		for bone in FEET:
			bones.append(skeleton.find_bone(bone))
		print("--- ", path.get_file())
		for anim in player.get_animation_list():
			if not (anim.begins_with("Walk_") or anim.begins_with("Jog_")):
				continue
			var speed := _measure(player, skeleton, bones, anim)
			var note := ""
			if KNOWN.has(anim):
				note = "   check: known %.2f, off by %+.2f" % [KNOWN[anim], speed - KNOWN[anim]]
			print("%-22s %5.2f m/s%s" % [anim, speed, note])
		inst.queue_free()
	quit()


func _measure(player: AnimationPlayer, skeleton: Skeleton3D, bones: Array[int],
		anim: String) -> float:
	var clip := player.get_animation(anim)
	if clip == null or clip.length <= 0.0 or bones.has(-1):
		return 0.0
	var dt := clip.length / STEPS
	player.play(anim)
	player.seek(0.0, true)
	var track: Array = [[], []]
	for i in STEPS + 1:
		for f in bones.size():
			track[f].append(_pose(skeleton, bones[f]).origin)
		player.advance(dt)

	var samples: Array[float] = []
	for f in bones.size():
		var path: Array = track[f]
		var low := INF
		var high := -INF
		for at in path:
			low = minf(low, at.y)
			high = maxf(high, at.y)
		var floor_band: float = low + (high - low) * STANCE_BAND
		for i in range(1, path.size()):
			if path[i].y > floor_band or path[i - 1].y > floor_band:
				continue
			var step: Vector3 = path[i] - path[i - 1]
			samples.append(Vector2(step.x, step.z).length() / dt)
	if samples.is_empty():
		return 0.0
	samples.sort()
	return samples[samples.size() / 2]


## Bone pose in skeleton space, composed rather than read back.
func _pose(skeleton: Skeleton3D, idx: int) -> Transform3D:
	var out := skeleton.get_bone_pose(idx)
	var parent := skeleton.get_bone_parent(idx)
	while parent >= 0:
		out = skeleton.get_bone_pose(parent) * out
		parent = skeleton.get_bone_parent(parent)
	return out


func _all(node: Node) -> Array[Node]:
	var out: Array[Node] = [node]
	for child in node.get_children():
		out.append_array(_all(child))
	return out
