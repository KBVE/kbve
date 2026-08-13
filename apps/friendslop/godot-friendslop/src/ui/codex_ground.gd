extends Node3D

## Ground for the Codex, standing in for the terrain the foot IK expects.

var tilt := 0.0
var facing := 0.0

var _plane: MeshInstance3D


func _ready() -> void:
	var mesh := PlaneMesh.new()
	mesh.size = Vector2(6.0, 6.0)
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.35, 0.38, 0.32)
	material.roughness = 0.95
	_plane = MeshInstance3D.new()
	_plane.mesh = mesh
	_plane.material_override = material
	add_child(_plane)


func set_slope(degrees: float, heading: float) -> void:
	tilt = deg_to_rad(degrees)
	facing = heading
	if _plane:
		_plane.transform = Transform3D(_basis(), Vector3.ZERO)


## Height of the tilted plane through the origin.
func height_at(x: float, z: float) -> float:
	var normal := _basis() * Vector3.UP
	if absf(normal.y) < 0.0001:
		return 0.0
	return -(normal.x * x + normal.z * z) / normal.y


func _basis() -> Basis:
	return Basis(Vector3.UP, facing) * Basis(Vector3.RIGHT, tilt)
