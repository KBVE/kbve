extends RefCounted

## Stand-in weapons, built from primitives, so combat can be worked on before
## any art exists and without waiting on an export.
##
## They are not a separate code path: a proxy comes out shaped exactly like a
## finished weapon scene is expected to be -- meshes under a root, with a
## Grip_Main marker where the holding hand goes and a Grip_Off marker for the
## second hand on the two-handed ones. Swapping a real mesh in is a change of
## file, not of code, and if the real mesh is missing its markers the same
## fallback catches both.
##
## Blade runs up +Y, edge across X, and the root sits at the hand.

const HANDLE := Color(0.24, 0.16, 0.11)
const STEEL := Color(0.72, 0.74, 0.78)
const BRASS := Color(0.65, 0.5, 0.22)

## grip/off are heights along the handle. off is only read for two-handed.
const KINDS := {
	"dagger": {
		"two_handed": false, "grip": -0.02, "off": 0.0,
		"handle": {"len": 0.11, "radius": 0.017, "at": 0.0},
		"guard": {"size": Vector3(0.10, 0.022, 0.03), "at": 0.065},
		"blade": {"size": Vector3(0.040, 0.30, 0.012), "at": 0.23},
	},
	"sword": {
		"two_handed": false, "grip": -0.02, "off": 0.0,
		"handle": {"len": 0.15, "radius": 0.019, "at": 0.0},
		"guard": {"size": Vector3(0.22, 0.030, 0.035), "at": 0.09},
		"blade": {"size": Vector3(0.055, 0.85, 0.016), "at": 0.53},
	},
	"greatsword": {
		"two_handed": true, "grip": 0.02, "off": -0.20,
		"handle": {"len": 0.40, "radius": 0.026, "at": -0.08},
		"guard": {"size": Vector3(0.34, 0.048, 0.05), "at": 0.13},
		"blade": {"size": Vector3(0.090, 1.30, 0.025), "at": 0.81},
	},
	"mace": {
		"two_handed": false, "grip": -0.14, "off": 0.0,
		"handle": {"len": 0.55, "radius": 0.022, "at": 0.0},
		"guard": {"size": Vector3(0.06, 0.02, 0.06), "at": 0.28},
		"blade": {"size": Vector3(0.13, 0.15, 0.13), "at": 0.36},
	},
	"spear": {
		"two_handed": true, "grip": 0.0, "off": -0.45,
		"handle": {"len": 1.90, "radius": 0.020, "at": 0.20},
		"guard": {"size": Vector3(0.05, 0.04, 0.05), "at": 1.10},
		"blade": {"size": Vector3(0.055, 0.34, 0.014), "at": 1.30},
	},
}


static func kinds() -> Array:
	return KINDS.keys()


static func two_handed(kind: String) -> bool:
	return KINDS.get(kind, KINDS.sword).two_handed


static func make(kind: String) -> Node3D:
	var spec: Dictionary = KINDS.get(kind, KINDS.sword)
	var root := Node3D.new()
	root.name = kind.capitalize()

	root.add_child(_part("Handle", CylinderMesh.new(), spec.handle, HANDLE))
	root.add_child(_part("Guard", BoxMesh.new(), spec.guard, BRASS))
	root.add_child(_part("Blade", BoxMesh.new(), spec.blade, STEEL))

	var grip := Marker3D.new()
	grip.name = "Grip_Main"
	grip.position = Vector3(0.0, spec.grip, 0.0)
	root.add_child(grip)
	if spec.two_handed:
		var off := Marker3D.new()
		off.name = "Grip_Off"
		off.position = Vector3(0.0, spec.off, 0.0)
		root.add_child(off)
	return root


static func _part(name: String, mesh: Mesh, spec: Dictionary, tint: Color) -> MeshInstance3D:
	if mesh is CylinderMesh:
		var cyl: CylinderMesh = mesh
		cyl.top_radius = spec.radius
		cyl.bottom_radius = spec.radius
		cyl.height = spec.len
		cyl.radial_segments = 8
		cyl.rings = 1
	elif mesh is BoxMesh:
		(mesh as BoxMesh).size = spec.size
	var material := StandardMaterial3D.new()
	material.albedo_color = tint
	material.metallic = 0.8 if tint == STEEL else 0.2
	material.roughness = 0.35 if tint == STEEL else 0.7
	var inst := MeshInstance3D.new()
	inst.name = name
	inst.mesh = mesh
	inst.material_override = material
	inst.position = Vector3(0.0, spec.at, 0.0)
	return inst
