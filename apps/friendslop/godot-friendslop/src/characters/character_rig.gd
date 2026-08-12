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
	if snap_to_terrain:
		_snap()


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
