extends SceneTree

var _fired: Array[String] = []


func _initialize() -> void:
	var world := ECSWorld.new("test")
	var hub := ObserverHub.new()
	var rels := Relations.new()

	hub.observe([&"Health"], ObserverHub.ADDED | ObserverHub.REMOVED, func(ev: int, e: ECSEntity, _c: ECSComponent) -> void:
		_fired.append("health/%d/%d" % [ev, e.id()]))
	hub.observe([&"Health", &"Tag"], ObserverHub.MATCHED | ObserverHub.UNMATCHED, func(ev: int, e: ECSEntity, _c: ECSComponent) -> void:
		_fired.append("pair/%d/%d" % [ev, e.id()]))

	var e := world.create_entity()
	hub.track(e)
	e.add_component("Health", ECSDataComponent.new(0))
	e.add_component("Tag", ECSDataComponent.new(0))
	e.remove_component("Tag")
	e.remove_component("Health")

	assert(_fired == [
		"health/%d/%d" % [ObserverHub.ADDED, e.id()],
		"pair/%d/%d" % [ObserverHub.MATCHED, e.id()],
		"pair/%d/%d" % [ObserverHub.UNMATCHED, e.id()],
		"health/%d/%d" % [ObserverHub.REMOVED, e.id()],
	], "observer events wrong: %s" % [_fired])

	var got: Array[String] = []
	rels.relation_added.connect(func(s: int, r: StringName, t: int, _d: Variant) -> void:
		got.append("+%d/%s/%d" % [s, r, t]))
	rels.relation_removed.connect(func(s: int, r: StringName, t: int) -> void:
		got.append("-%d/%s/%d" % [s, r, t]))

	rels.link(1, &"owns", 2, {"since": 5})
	rels.link(3, &"owns", 2)
	assert(rels.has_relation(1, &"owns", 2))
	assert(rels.targets(1, &"owns") == [2])
	assert(rels.sources(2, &"owns") == [1, 3])
	assert(rels.relation_data(1, &"owns", 2).since == 5)
	rels.unlink_all(2)
	assert(not rels.has_relation(1, &"owns", 2))
	assert(not rels.has_relation(3, &"owns", 2))
	assert(rels.sources(2, &"owns").is_empty())
	assert(got == ["+1/owns/2", "+3/owns/2", "-1/owns/2", "-3/owns/2"], "relation events wrong: %s" % [got])

	world.clear()
	print("smoke_ecs OK")
	quit(0)
