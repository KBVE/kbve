extends Node3D

func _ready() -> void:
	var mat: ShaderMaterial = load("res://assets/environment/props/rocks/rock.tres")
	for i in range(3):
		var scene: PackedScene = load("res://assets/environment/props/rocks/rock_%d.glb" % i)
		var inst := scene.instantiate()
		inst.position = Vector3(float(i - 1) * 2.2, 0.0, 0.0)
		add_child(inst)
		_apply(inst, mat)
	var exploded_scene: PackedScene = load("res://assets/environment/props/rocks/rock_1.glb")
	var exploded: Node3D = exploded_scene.instantiate()
	exploded.position = Vector3(0.0, 0.0, -3.0)
	add_child(exploded)
	_apply(exploded, mat)
	var k := 0
	for child in exploded.get_children():
		if child is MeshInstance3D and child.name.contains("chunk"):
			child.position += (child.position - Vector3.ZERO).normalized() * 0.4 + Vector3(0, 0.2 * k, 0)
			k += 1
		elif child is MeshInstance3D:
			child.visible = false

func _apply(node: Node, mat: ShaderMaterial) -> void:
	if node is MeshInstance3D:
		node.material_override = mat
	for c in node.get_children():
		_apply(c, mat)
