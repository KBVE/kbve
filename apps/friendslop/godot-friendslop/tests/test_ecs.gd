extends GdUnitTestSuite


func test_observer_events() -> void:
	var world := ECSWorld.new("test")
	var hub := ObserverHub.new()
	var fired: Array[String] = []

	hub.observe([&"Health"], ObserverHub.ADDED | ObserverHub.REMOVED, func(ev: int, e: ECSEntity, _c: ECSComponent) -> void:
		fired.append("health/%d/%d" % [ev, e.id()]))
	hub.observe([&"Health", &"Tag"], ObserverHub.MATCHED | ObserverHub.UNMATCHED, func(ev: int, e: ECSEntity, _c: ECSComponent) -> void:
		fired.append("pair/%d/%d" % [ev, e.id()]))

	var entity := world.create_entity()
	hub.track(entity)
	entity.add_component("Health", ECSDataComponent.new(0))
	entity.add_component("Tag", ECSDataComponent.new(0))
	entity.remove_component("Tag")
	entity.remove_component("Health")

	assert_array(fired).is_equal([
		"health/%d/%d" % [ObserverHub.ADDED, entity.id()],
		"pair/%d/%d" % [ObserverHub.MATCHED, entity.id()],
		"pair/%d/%d" % [ObserverHub.UNMATCHED, entity.id()],
		"health/%d/%d" % [ObserverHub.REMOVED, entity.id()],
	])
	world.clear()


func test_relations() -> void:
	var rels := Relations.new()
	var got: Array[String] = []

	rels.relation_added.connect(func(s: int, r: StringName, t: int, _d: Variant) -> void:
		got.append("+%d/%s/%d" % [s, r, t]))
	rels.relation_removed.connect(func(s: int, r: StringName, t: int) -> void:
		got.append("-%d/%s/%d" % [s, r, t]))

	rels.link(1, &"owns", 2, {"since": 5})
	rels.link(3, &"owns", 2)
	assert_bool(rels.has_relation(1, &"owns", 2)).is_true()
	assert_array(rels.targets(1, &"owns")).is_equal([2])
	assert_array(rels.sources(2, &"owns")).is_equal([1, 3])
	assert_int(rels.relation_data(1, &"owns", 2).since).is_equal(5)

	rels.unlink_all(2)
	assert_bool(rels.has_relation(1, &"owns", 2)).is_false()
	assert_bool(rels.has_relation(3, &"owns", 2)).is_false()
	assert_array(rels.sources(2, &"owns")).is_empty()
	assert_array(got).is_equal(["+1/owns/2", "+3/owns/2", "-1/owns/2", "-3/owns/2"])
