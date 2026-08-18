extends GdUnitTestSuite


const CharacterRig := preload("res://src/characters/character_rig.gd")

const BODY_DIR := "res://assets/characters/quaternius_ubc/models"
const HAIR_DIR := "res://assets/characters/quaternius_ubc/models/hair"
const UAL1 := "res://assets/characters/quaternius_ubc/animations/UAL1.glb"
const UAL2 := "res://assets/characters/quaternius_ubc/animations/UAL2.glb"

const BODIES := [
	"Regular_Male_FullBody",
	"Regular_Female_FullBody",
	"Teen_Male_FullBody",
	"Teen_Female_FullBody",
]
const HAIR := ["Hair_Ponytail", "Hair_SimpleParted", "Hair_Beard", "Hair_Bob", "Hair_Long"]

const RETARGETED := ["Hips", "Spine", "Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot"]


func test_every_body_in_the_kit_loads() -> void:
	for body: String in BODIES:
		assert_object(load("%s/%s.glb" % [BODY_DIR, body])) \
				.override_failure_message("%s did not load" % body).is_not_null()


func test_every_hairstyle_in_the_kit_loads() -> void:
	for hair: String in HAIR:
		assert_object(load("%s/%s.glb" % [HAIR_DIR, hair])) \
				.override_failure_message("%s did not load" % hair).is_not_null()


func test_every_body_was_retargeted_onto_the_shared_skeleton() -> void:
	for body: String in BODIES:
		var scene: PackedScene = load("%s/%s.glb" % [BODY_DIR, body])
		var instance: Node3D = scene.instantiate()
		auto_free(instance)
		var skeleton := _skeleton(instance)
		assert_object(skeleton) \
				.override_failure_message("%s has no Skeleton3D" % body).is_not_null()
		for bone: String in RETARGETED:
			assert_int(skeleton.find_bone(bone)) \
					.override_failure_message("%s was not retargeted -- no '%s' bone" % [body, bone]) \
					.is_greater_equal(0)


func test_every_hairstyle_was_retargeted() -> void:
	for hair: String in HAIR:
		var scene: PackedScene = load("%s/%s.glb" % [HAIR_DIR, hair])
		var instance: Node3D = scene.instantiate()
		auto_free(instance)
		var skeleton := _skeleton(instance)
		assert_object(skeleton) \
				.override_failure_message("%s has no Skeleton3D" % hair).is_not_null()
		assert_int(skeleton.find_bone("Head")) \
				.override_failure_message("%s was not retargeted -- no 'Head' bone" % hair) \
				.is_greater_equal(0)


func test_every_body_takes_the_shared_animations() -> void:
	for body: String in BODIES:
		var rig := CharacterRig.new()
		rig.body = load("%s/%s.glb" % [BODY_DIR, body])
		rig.animation_sources = [load(UAL1), load(UAL2)]
		rig.default_animation = CharacterRig.IDLE_CLIP
		add_child(rig)
		auto_free(rig)
		await get_tree().process_frame

		assert_object(rig.animation) \
				.override_failure_message("%s got no AnimationPlayer" % body).is_not_null()
		assert_bool(rig.animation.has_animation(CharacterRig.IDLE_CLIP)) \
				.override_failure_message("%s cannot play %s" % [body, CharacterRig.IDLE_CLIP]) \
				.is_true()


func test_every_body_has_something_to_draw() -> void:
	for body: String in BODIES:
		var instance: Node3D = (load("%s/%s.glb" % [BODY_DIR, body]) as PackedScene).instantiate()
		auto_free(instance)
		var meshes := _meshes(instance)
		assert_int(meshes) \
				.override_failure_message("%s has no mesh" % body).is_greater(0)


const PERFORMANCE := ["idle_animation", "talk_animation", "listen_animation",
		"meeting_animation"]


func test_every_clip_the_world_asks_for_is_in_the_kit() -> void:
	var rig := CharacterRig.new()
	rig.body = load("%s/%s.glb" % [BODY_DIR, BODIES[0]])
	rig.animation_sources = [load(UAL1), load(UAL2)]
	add_child(rig)
	auto_free(rig)
	await get_tree().process_frame
	assert_object(rig.animation).is_not_null()

	var defaults := NpcActor.new()
	auto_free(defaults)

	var missing: Array[String] = []
	var asked := 0
	var state := (load("res://scenes/main.tscn") as PackedScene).get_state()
	for i in state.get_node_count():
		var props := {}
		for p in state.get_node_property_count(i):
			props[state.get_node_property_name(i, p)] = state.get_node_property_value(i, p)
		if str(props.get("npc_ref", "")) == "":
			continue
		for field: String in PERFORMANCE:
			var clip := str(props.get(field, defaults.get(field)))
			if clip == "":
				continue
			asked += 1
			if not rig.animation.has_animation(clip) and not missing.has(clip):
				missing.append(clip)

	assert_int(asked) \
			.override_failure_message("nobody in the world was given anything to do") \
			.is_greater(0)
	assert_array(missing) \
			.override_failure_message("the kit has no clip called %s" % ", ".join(missing)) \
			.is_empty()


func test_every_surface_the_kit_can_wear_has_a_cel_entry() -> void:
	var missing: Array[String] = []
	for body: String in BODIES:
		_unshaded("%s/%s.glb" % [BODY_DIR, body], missing)
	for hair: String in HAIR:
		_unshaded("%s/%s.glb" % [HAIR_DIR, hair], missing)
	for id: StringName in Wardrobe.all():
		_unshaded(Wardrobe.path_of(id), missing)
	assert_array(missing) \
			.override_failure_message("no cel entry for %s" % ", ".join(missing)) \
			.is_empty()


func _unshaded(path: String, into: Array[String]) -> void:
	var scene: PackedScene = load(path)
	if scene == null:
		return
	var instance: Node3D = scene.instantiate()
	auto_free(instance)
	for mesh in _mesh_nodes(instance):
		for i in mesh.mesh.get_surface_count():
			var material := mesh.mesh.surface_get_material(i) as BaseMaterial3D
			if material == null:
				continue
			var name := material.resource_name
			if not CharacterRig.SHADING.has(StringName(name)) and not into.has(name):
				into.append(name)


func _mesh_nodes(node: Node) -> Array[MeshInstance3D]:
	var out: Array[MeshInstance3D] = []
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null:
		out.append(node)
	for child in node.get_children():
		out.append_array(_mesh_nodes(child))
	return out


func _skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var found := _skeleton(child)
		if found:
			return found
	return null


func _meshes(node: Node) -> int:
	var count := 1 if node is MeshInstance3D else 0
	for child in node.get_children():
		count += _meshes(child)
	return count
