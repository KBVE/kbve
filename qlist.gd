extends SceneTree
func _init() -> void:
	for p in ["res://assets/characters/quaternius_ubc/animations/UAL1.glb",
			  "res://assets/characters/quaternius_ubc/animations/UAL2.glb"]:
		var inst := (load(p) as PackedScene).instantiate()
		var ap := _f(inst) as AnimationPlayer
		var lib := ap.get_animation_library(&"")
		var hits := []
		for n in lib.get_animation_list():
			var s := String(n)
			if s.begins_with("Walk") or s.begins_with("Run") or s.begins_with("Jog") \
					or s.begins_with("Sprint") or s.begins_with("Strafe") or s == "Idle":
				hits.append("%s(%.2fs,loop=%d)" % [s, lib.get_animation(n).length, lib.get_animation(n).loop_mode])
		print(p.get_file(), " -> ", hits)
	quit()
func _f(n: Node) -> Node:
	if n is AnimationPlayer: return n
	for c in n.get_children():
		var r := _f(c)
		if r: return r
	return null
