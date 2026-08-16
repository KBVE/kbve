extends SceneTree
const Rig := preload("res://src/characters/character_rig.gd")

func _init() -> void:
	var usage: Dictionary = Rig.clip_usage()
	print("USAGE count=%d" % usage.size())
	var keys: Array = usage.keys()
	keys.sort()
	for k in keys:
		if String(k).contains("Roll") or String(k).contains("Shield") or String(k).contains("Dodge") or String(k).contains("Flip") or String(k).contains("Slide"):
			print("USE %-22s -> %s" % [k, usage[k]])
	# every wired clip must actually exist in the libraries
	var rig := Rig.new()
	rig.body = load("res://assets/characters/quaternius_ubc/models/Regular_Male_FullBody.glb")
	rig.animation_sources = [
		load("res://assets/characters/quaternius_ubc/animations/UAL1.glb"),
		load("res://assets/characters/quaternius_ubc/animations/UAL2.glb"),
	]
	rig.locomotion = true
	rig.snap_to_terrain = false
	root.add_child(rig)
	await process_frame
	var missing: Array = []
	for k in keys:
		if not rig.animation.has_animation(k):
			missing.append(k)
	print("MISSING %s" % str(missing))
	print("TOTAL library clips=%d wired=%d" % [rig.animation.get_animation_list().size(), usage.size()])
	quit()
