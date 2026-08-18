extends GdUnitTestSuite


const CreatureRig := preload("res://src/characters/creature_rig.gd")
const MECH_DIR := "res://assets/characters/creatures/mech/models/"
const MECHS := ["George", "Leela", "Mike", "Stan"]

const RADIUS_SCALE := 0.4
const MIN_RADIUS := 0.2


func _rig_for(name: String) -> Node3D:
	var path := MECH_DIR + name + ".glb"
	assert_bool(ResourceLoader.exists(path)).is_true()
	var rig: Node3D = CreatureRig.new()
	rig.body = load(path)
	rig.display_name = ""
	rig.foot_ik = false
	add_child(rig)
	await await_idle_frame()
	return rig


func _capsule_of(box: AABB) -> Dictionary:
	var height: float = box.size.y
	var radius: float = minf(box.size.x, box.size.z) * RADIUS_SCALE
	radius = maxf(radius, MIN_RADIUS)
	height = maxf(height, radius * 2.0 + 0.1)
	return {
		"radius": radius,
		"height": height,
		"center_y": box.position.y + height * 0.5,
		"floor_y": box.position.y,
	}


func test_every_mech_reports_bounds_that_stand_on_the_ground() -> void:
	for name in MECHS:
		var rig: Node3D = await _rig_for(name)
		var box: AABB = rig.mesh_extents()
		var cap := _capsule_of(box)
		prints("[mech]", name,
				"aabb pos=%v size=%v" % [box.position, box.size],
				"radius=%.3f height=%.3f center_y=%.3f" % [
						cap.radius, cap.height, cap.center_y])
		assert_float(box.size.y).is_greater(0.5)
		rig.queue_free()


func test_every_mech_stands_on_its_own_origin() -> void:
	for name in MECHS:
		var rig: Node3D = await _rig_for(name)
		var box: AABB = rig.mesh_extents()
		assert_float(absf(box.position.y)).override_failure_message(
				"%s bind pose starts at y=%.3f, so its capsule sits %.3f off the ground" % [
						name, box.position.y, box.position.y]
				).is_less(0.35)
		rig.queue_free()


func test_capsule_radii_stay_inside_the_packs_range() -> void:
	for name in MECHS:
		var rig: Node3D = await _rig_for(name)
		var cap := _capsule_of(rig.mesh_extents())
		assert_float(cap.radius).override_failure_message(
				"%s derives radius %.3f, outside the 0.6-1.1 the pack was authored for" % [
						name, cap.radius]
				).is_between(0.6, 1.1)
		rig.queue_free()
