extends Node3D

const COLS := 12
const SPACING := 3.0

func _ready() -> void:
	var mat: ShaderMaterial = load("res://assets/environment/props/rocks/rock.tres")
	var field: Node = ClassDB.instantiate("QStoneField")
	add_child(field)
	for stage in range(1):
		for v in range(COLS):
			var mesh: ArrayMesh = field.call("preview_mesh", v, stage)
			if mesh == null:
				continue
			var mi := MeshInstance3D.new()
			mi.mesh = mesh
			mi.material_override = mat
			mi.position = Vector3(
				(float(v) - float(COLS - 1) * 0.5) * SPACING,
				0.0,
				(float(stage) - 1.0) * SPACING)
			add_child(mi)
	field.queue_free()
