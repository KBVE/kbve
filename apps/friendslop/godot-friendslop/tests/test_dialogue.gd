extends GdUnitTestSuite


const Graph := preload("res://src/dialogue/dialogue_graph.gd")
const State := preload("res://src/dialogue/dialogue_state.gd")
const Runner := preload("res://src/dialogue/dialogue_runner.gd")

const Npcdb := preload("res://src/dialogue/npcdb_dialogue.gd")
const TalkPanel := preload("res://src/ui/dialogue_panel.gd")
const KeyHint := preload("res://src/ui/input_hint.gd")
const Interactor := preload("res://src/player/interactor.gd")

const MARLOW := "marlow"

const TOLL := "You want a toll, don't you."
const MECHS := "What are those walking machines?"
const PAY := "Pay the toll."
const LEAVE := "(Walk away.)"

const SECOND_TIER := {
	"merchant": ["marlow_toll_paid", "I paid Marlow's toll."],
	"cleric": ["wren_taught_bitterroot", "The forager showed me bitterroot."],
	"knight": ["sable_showed_the_book", "The warden keeps a book of who crosses."],
	"mage": ["tam_guessed_the_mechs", "The boy on the bank thinks they are waiting for something."],
}

const SIMPLE := {
	"start": "one",
	"speaker": "npc.test.name",
	"nodes": {
		"one": {"line": "a", "to": "two"},
		"two": {"line": "b"},
	},
}


func _running(raw: Dictionary, state: DialogueState = null) -> DialogueRunner:
	var runner := Runner.new()
	runner.start(Graph.from_dict(raw), state if state else State.new())
	return runner


func test_a_line_runs_to_its_end() -> void:
	var runner := _running(SIMPLE)
	assert_str(runner.line_key()).is_equal("a")
	assert_str(runner.speaker_key()).is_equal("npc.test.name")
	assert_bool(runner.advance()).is_true()
	assert_str(runner.line_key()).is_equal("b")
	assert_bool(runner.advance()).is_false()
	assert_bool(runner.is_running()).is_false()


func test_a_node_with_choices_waits_for_one() -> void:
	var runner := _running({
		"start": "ask",
		"nodes": {
			"ask": {"line": "q", "choices": [{"text": "yes", "to": "end"}]},
			"end": {"line": "done"},
		},
	})
	runner.advance()
	assert_str(runner.line_key()).is_equal("q")
	assert_bool(runner.choose(0)).is_true()
	assert_str(runner.line_key()).is_equal("done")


func test_a_choice_without_a_target_ends_the_talk() -> void:
	var runner := _running({
		"start": "ask",
		"nodes": {"ask": {"line": "q", "choices": [{"text": "bye", "to": ""}]}},
	})
	assert_bool(runner.choose(0)).is_false()
	assert_bool(runner.is_running()).is_false()


func test_a_gated_choice_is_not_offered_or_taken() -> void:
	var state := State.new()
	var runner := _running({
		"start": "ask",
		"nodes": {
			"ask": {"line": "q", "choices": [
				{"text": "paid", "to": "end", "if": "coin"},
				{"text": "open", "to": "end"},
			]},
			"end": {"line": "done"},
		},
	}, state)

	var offered := runner.choices()
	assert_int(offered.size()).is_equal(1)
	assert_str(offered[0][&"text"]).is_equal("open")
	assert_bool(runner.choose(0)) \
			.override_failure_message("a hidden choice was still takeable") \
			.is_false()

	state.set_flag("coin")
	assert_int(runner.choices().size()).is_equal(2)
	assert_bool(runner.choose(0)).is_true()


func test_choice_indices_survive_filtering() -> void:
	var runner := _running({
		"start": "ask",
		"nodes": {
			"ask": {"line": "q", "choices": [
				{"text": "hidden", "to": "wrong", "if": "never"},
				{"text": "shown", "to": "right"},
			]},
			"wrong": {"line": "wrong"},
			"right": {"line": "right"},
		},
	})
	var offered := runner.choices()
	assert_int(offered[0][&"index"]).is_equal(1)
	runner.choose(offered[0][&"index"])
	assert_str(runner.line_key()).is_equal("right")


func test_a_node_whose_gate_fails_steps_aside_for_its_else() -> void:
	var state := State.new()
	state.set_flag("met")
	var runner := _running({
		"start": "greet",
		"nodes": {
			"greet": {"line": "first", "if": {"not": "met"}, "else": "again"},
			"again": {"line": "second"},
		},
	}, state)
	assert_str(runner.line_key()).is_equal("second")


func test_a_gate_with_no_else_ends_the_talk() -> void:
	var state := State.new()
	state.set_flag("done")
	var runner := _running({
		"start": "only",
		"nodes": {"only": {"line": "x", "if": {"not": "done"}}},
	}, state)
	assert_bool(runner.is_running()).is_false()


func test_entering_a_node_writes_down_what_it_says_to() -> void:
	var state := State.new()
	var runner := _running({
		"start": "one",
		"nodes": {"one": {"line": "a", "do": {"set": "heard"}, "to": "two"},
				"two": {"line": "b", "do": {"clear": "heard"}}},
	}, state)
	assert_bool(state.has_flag("heard")).is_true()
	runner.advance()
	assert_bool(state.has_flag("heard")).is_false()


func test_a_taken_choice_writes_down_what_it_says_to() -> void:
	var state := State.new()
	var runner := _running({
		"start": "ask",
		"nodes": {
			"ask": {"line": "q", "choices": [{"text": "pay", "to": "end", "do": {"set": "paid"}}]},
			"end": {"line": "done"},
		},
	}, state)
	runner.choose(0)
	assert_bool(state.has_flag("paid")).is_true()


func test_a_ring_of_failing_gates_is_refused_rather_than_hung() -> void:
	var runner := _running({
		"start": "a",
		"nodes": {
			"a": {"line": "a", "if": "never", "else": "b"},
			"b": {"line": "b", "if": "never", "else": "a"},
		},
	})
	assert_bool(runner.is_running()).is_false()


func test_conditions_read_flags_seen_nodes_and_combinations() -> void:
	var state := State.new()
	state.set_flag("coin")
	state.mark_seen("greet")

	assert_bool(state.test("coin")).is_true()
	assert_bool(state.test("axe")).is_false()
	assert_bool(state.test({"flag": "coin"})).is_true()
	assert_bool(state.test({"not": "axe"})).is_true()
	assert_bool(state.test({"seen": "greet"})).is_true()
	assert_bool(state.test({"seen": "toll"})).is_false()
	assert_bool(state.test({"all": ["coin", {"seen": "greet"}]})).is_true()
	assert_bool(state.test({"all": ["coin", "axe"]})).is_false()
	assert_bool(state.test({"any": ["axe", "coin"]})).is_true()
	assert_bool(state.test({"any": ["axe"]})).is_false()
	assert_bool(state.test(null)) \
			.override_failure_message("an ungated node was gated").is_true()


func test_state_survives_a_round_trip() -> void:
	var state := State.new()
	state.set_flag("coin")
	state.mark_seen("greet")
	var restored := State.new()
	restored.from_dict(state.to_dict())
	assert_bool(restored.has_flag("coin")).is_true()
	assert_bool(restored.has_seen("greet")).is_true()


func test_a_broken_jump_is_an_error_not_a_surprise() -> void:
	var graph := Graph.from_dict({
		"start": "one",
		"nodes": {"one": {"line": "a", "to": "nowhere"}},
	})
	assert_bool(graph.is_valid()).is_false()
	assert_str("\n".join(graph.errors())).contains("nowhere")


func test_a_missing_start_is_an_error() -> void:
	var graph := Graph.from_dict({"start": "absent", "nodes": {"one": {"line": "a"}}})
	assert_bool(graph.is_valid()).is_false()


func test_a_node_that_neither_speaks_nor_offers_is_an_error() -> void:
	var graph := Graph.from_dict({"start": "one", "nodes": {"one": {"to": ""}}})
	assert_bool(graph.is_valid()).is_false()


func test_a_graph_that_did_not_load_is_refused() -> void:
	var runner := Runner.new()
	assert_bool(runner.start(Graph.from_path("res://assets/dialogue/nope.json"), State.new())) \
			.is_false()
	assert_bool(runner.is_running()).is_false()


func test_the_catalog_schema_becomes_a_graph() -> void:
	var graph: Dictionary = Npcdb.to_graph_dict({"name": "Ana"}, {
		"entryNodeId": "one",
		"nodes": [
			{"id": "one", "text": "hello", "nextNodeId": "two",
					"triggerOnEnter": "set_flag:met"},
			{"id": "two", "text": "well?", "options": [
				{"id": "a", "label": "pay", "nextNodeId": "one", "setFlag": "paid",
						"requiredFlags": ["coin", "!paid"]},
				{"id": "b", "label": "go", "nextNodeId": ""},
			]},
		],
	})

	assert_str(str(graph["start"])).is_equal("one")
	assert_str(str(graph["speaker"])).is_equal("Ana")
	var nodes: Dictionary = graph["nodes"]
	assert_str(str(nodes["one"]["line"])).is_equal("hello")
	assert_str(str(nodes["one"]["to"])).is_equal("two")
	assert_that(nodes["one"]["do"]).is_equal({"set": "met"})

	var choice: Dictionary = (nodes["two"]["choices"] as Array)[0]
	assert_str(str(choice["text"])).is_equal("pay")
	assert_that(choice["do"]).is_equal({"set": "paid"})
	assert_that(choice["if"]).is_equal({"all": [{"flag": "coin"}, {"not": {"flag": "paid"}}]})


func test_a_gated_node_falls_through_to_the_next_one_in_the_list() -> void:
	var graph: Dictionary = Npcdb.to_graph_dict({}, {
		"entryNodeId": "greet",
		"nodes": [
			{"id": "greet", "text": "first", "condition": "!seen:greet"},
			{"id": "greet_again", "text": "second"},
		],
	})
	var nodes: Dictionary = graph["nodes"]
	assert_that(nodes["greet"]["if"]).is_equal({"not": {"seen": "greet"}})
	assert_str(str(nodes["greet"]["else"])).is_equal("greet_again")
	assert_bool((nodes["greet_again"] as Dictionary).has("else")) \
			.override_failure_message("an ungated node was given a fallback it cannot use") \
			.is_false()


func test_condition_strings_become_gates() -> void:
	var graph: Dictionary = Npcdb.to_graph_dict({}, {
		"entryNodeId": "a",
		"nodes": [
			{"id": "a", "text": "a", "condition": "flag:coin && !seen:b"},
			{"id": "b", "text": "b", "condition": "bare_flag"},
		],
	})
	var nodes: Dictionary = graph["nodes"]
	assert_that(nodes["a"]["if"]) \
			.is_equal({"all": [{"flag": "coin"}, {"not": {"seen": "b"}}]})
	assert_that(nodes["b"]["if"]) \
			.override_failure_message("a bare name is a flag, which is how the catalog writes them") \
			.is_equal({"flag": "bare_flag"})


func test_an_npc_the_catalog_does_not_have_is_refused() -> void:
	var runner := Runner.new()
	assert_bool(runner.start(Npcdb.graph("nobody"), State.new())).is_false()


func test_marlow_loads_clean_out_of_the_catalog() -> void:
	var graph := Npcdb.graph(MARLOW)
	assert_str("\n".join(graph.errors())).is_empty()


func test_marlow_speaks_words_rather_than_keys() -> void:
	var graph := Npcdb.graph(MARLOW)
	for key in graph.text_keys():
		assert_str(I18n.t(key)) \
				.override_failure_message("'%s' came through empty" % key) \
				.is_not_empty()
	assert_str(I18n.t(graph.speaker)).is_equal("Marlow")


func test_the_toll_changes_what_marlow_offers_afterwards() -> void:
	var state := State.new()
	var runner := Runner.new()
	runner.start(Npcdb.graph(MARLOW), state)

	assert_str(runner.node_id()).is_equal("greet")
	runner.advance()
	assert_str(runner.node_id()).is_equal("menu")
	assert_bool(_offers(runner, TOLL)).is_true()
	assert_bool(_offers(runner, MECHS)).is_false()

	runner.choose(_index_of(runner, TOLL))
	runner.choose(_index_of(runner, PAY))
	assert_bool(state.has_flag("marlow_toll_paid")).is_true()
	runner.advance()

	assert_str(runner.node_id()).is_equal("menu")
	assert_bool(_offers(runner, TOLL)) \
			.override_failure_message("he asked for the toll twice").is_false()
	assert_bool(_offers(runner, MECHS)).is_true()

	runner.choose(_index_of(runner, LEAVE))
	assert_str(runner.node_id()).is_equal("farewell_paid")


func test_marlow_greets_a_stranger_differently_to_a_regular() -> void:
	var state := State.new()
	var runner := Runner.new()
	runner.start(Npcdb.graph(MARLOW), state)
	assert_str(runner.node_id()).is_equal("greet")

	var again := Runner.new()
	again.start(Npcdb.graph(MARLOW), state)
	assert_str(again.node_id()) \
			.override_failure_message("he introduced himself to someone he had already met") \
			.is_equal("greet_again")


func test_marlow_is_wired_into_the_world() -> void:
	var packed := load("res://scenes/main.tscn") as PackedScene
	var state := packed.get_state()
	var found := false
	for i in state.get_node_count():
		if state.get_node_name(i) != "Marlow":
			continue
		found = true
		var props := {}
		for p in state.get_node_property_count(i):
			props[state.get_node_property_name(i, p)] = state.get_node_property_value(i, p)
		assert_str(str(props.get("npc_ref", ""))).is_equal(MARLOW)
		assert_object(props.get("body")) \
				.override_failure_message("Marlow has no body, so he is an invisible voice") \
				.is_not_null()
		assert_bool(bool(props.get("stand_under_bridge", false))) \
				.override_failure_message("Marlow was left wherever the scene was saved") \
				.is_true()
	assert_bool(found).override_failure_message("main.tscn has no Marlow").is_true()


func test_every_talker_by_the_crossing_is_wired_up() -> void:
	var state := (load("res://scenes/main.tscn") as PackedScene).get_state()
	var seen := {}
	for i in state.get_node_count():
		var props := {}
		for p in state.get_node_property_count(i):
			props[state.get_node_property_name(i, p)] = state.get_node_property_value(i, p)
		var who := str(props.get("npc_ref", ""))
		if who == "":
			continue
		seen[who] = true

		var graph := Npcdb.graph(who)
		assert_bool(graph.is_valid()) \
				.override_failure_message("%s: %s" % [who, "; ".join(graph.errors())]) \
				.is_true()
		assert_object(props.get("body")) \
				.override_failure_message("%s has no body, so they are an invisible voice" % who) \
				.is_not_null()
		assert_bool(bool(props.get("stand_under_bridge", false))) \
				.override_failure_message("%s was left wherever the scene was saved" % who) \
				.is_true()

	for who: String in [MARLOW, "wren", "tam", "sable", "merchant", "cleric", "knight", "mage"]:
		assert_bool(seen.has(who)) \
				.override_failure_message("main.tscn has nobody with npc_ref '%s'" % who).is_true()


func test_the_second_tier_opens_only_once_the_first_has_been_talked_to() -> void:
	for who: String in SECOND_TIER:
		var flag: String = SECOND_TIER[who][0]
		var reply: String = SECOND_TIER[who][1]
		var state := State.new()
		var runner := Runner.new()
		assert_bool(runner.start(Npcdb.graph(who), state)) \
				.override_failure_message("%s has no conversation to start" % who).is_true()
		runner.advance()

		assert_bool(_offers(runner, reply)) \
				.override_failure_message("%s offered '%s' to somebody who had never heard it" % [
						who, reply]) \
				.is_false()
		state.set_flag(flag)
		assert_bool(_offers(runner, reply)) \
				.override_failure_message("%s ignored '%s', so the reply can never be reached" % [
						who, flag]) \
				.is_true()


func test_every_flag_the_crossing_waits_on_is_one_somebody_sets() -> void:
	var wanted := {}
	var given := {}
	for who in _talkers():
		var graph := Npcdb.graph(who)
		for id: Variant in graph.nodes:
			var entry := graph.node(str(id))
			_flags_set_by(entry, given)
			_flags_gating(entry.get("if", null), wanted)
			for choice: Variant in entry.get("choices", []):
				if choice is Dictionary:
					_flags_set_by(choice, given)
					_flags_gating((choice as Dictionary).get("if", null), wanted)

	assert_int(wanted.size()) \
			.override_failure_message("nothing by the crossing waits on anything") \
			.is_greater(0)
	for flag: String in wanted:
		assert_bool(given.has(flag)) \
				.override_failure_message("'%s' gates a reply and nobody by the crossing sets it" % flag) \
				.is_true()


func _flags_set_by(entry: Dictionary, into: Dictionary) -> void:
	var effects: Variant = entry.get("do", null)
	if effects is Dictionary and (effects as Dictionary).has("set"):
		into[str((effects as Dictionary)["set"])] = true


func _flags_gating(gate: Variant, into: Dictionary) -> void:
	if gate is String:
		into[str(gate)] = true
		return
	if gate is not Dictionary:
		return
	var terms: Dictionary = gate
	if terms.has("flag"):
		into[str(terms["flag"])] = true
	for key in ["not", "all", "any"]:
		if not terms.has(key):
			continue
		var inner: Variant = terms[key]
		if inner is Array:
			for one: Variant in inner:
				_flags_gating(one, into)
		else:
			_flags_gating(inner, into)


func _talkers() -> PackedStringArray:
	var state := (load("res://scenes/main.tscn") as PackedScene).get_state()
	var out := PackedStringArray()
	for i in state.get_node_count():
		for p in state.get_node_property_count(i):
			if state.get_node_property_name(i, p) != "npc_ref":
				continue
			var who := str(state.get_node_property_value(i, p))
			if who != "" and not out.has(who):
				out.append(who)
	return out


class StubCrossing extends Node3D:
	signal ground_ready

	const HALF_WIDTH := 3.0

	var laid := true

	func is_ground_ready() -> bool:
		return laid

	func height_at(_x: float, _z: float) -> float:
		return 0.0

	func bridge_span() -> PackedFloat32Array:
		return PackedFloat32Array([0.0, -24.0, 0.0, 24.0, HALF_WIDTH]) if laid \
				else PackedFloat32Array()

	func lay_the_ground() -> void:
		laid = true
		ground_ready.emit()


func test_the_talkers_are_not_standing_on_each_other() -> void:
	var spots: Dictionary = await _placed_against_a_crossing()
	var names := spots.keys()
	assert_int(names.size()).is_greater(1)
	for a in names.size():
		for b in range(a + 1, names.size()):
			var gap: float = (spots[names[a]] as Vector2).distance_to(spots[names[b]])
			assert_float(gap) \
					.override_failure_message("%s and %s stand %.1fm apart by the bridge" % [
							names[a], names[b], gap]) \
					.is_greater(5.0)


func test_nobody_is_standing_in_the_road() -> void:
	var spots: Dictionary = await _placed_against_a_crossing()
	for who: String in spots:
		assert_float(absf((spots[who] as Vector2).x)) \
				.override_failure_message("%s is standing on the deck rather than beside it" % who) \
				.is_greater(StubCrossing.HALF_WIDTH)


func test_somebody_who_asks_before_the_crossing_exists_still_gets_placed() -> void:
	var world := Node3D.new()
	add_child(world)
	auto_free(world)
	var ground := StubCrossing.new()
	ground.name = "Ground"
	ground.laid = false
	world.add_child(ground)

	var actor := NpcActor.new()
	actor.npc_ref = MARLOW
	actor.stand_under_bridge = true
	actor.bridge_offset = 2.0
	actor.bridge_along = 9.0
	actor.terrain_path = NodePath("../Ground")
	world.add_child(actor)
	await get_tree().process_frame

	assert_vector(actor.global_position) \
			.override_failure_message("he was placed against a crossing that did not exist yet") \
			.is_equal(Vector3.ZERO)

	ground.lay_the_ground()
	await get_tree().process_frame
	assert_float(Vector2(actor.global_position.x, actor.global_position.z).length()) \
			.override_failure_message("the crossing was laid down and nobody moved to it") \
			.is_greater(1.0)


func _placed_against_a_crossing() -> Dictionary:
	var world := Node3D.new()
	add_child(world)
	auto_free(world)
	var ground := StubCrossing.new()
	ground.name = "Ground"
	world.add_child(ground)

	var actors := {}
	for stand: Dictionary in _authored_stands():
		var actor := NpcActor.new()
		actor.npc_ref = str(stand["ref"])
		actor.stand_under_bridge = bool(stand["bridge"])
		actor.bridge_offset = float(stand["offset"])
		actor.bridge_along = float(stand["along"])
		actor.terrain_path = NodePath("../Ground")
		world.add_child(actor)
		actors[str(stand["ref"])] = actor
	await get_tree().process_frame

	var spots := {}
	for who: String in actors:
		var at: Vector3 = (actors[who] as Node3D).global_position
		spots[who] = Vector2(at.x, at.z)
	return spots


func _authored_stands() -> Array[Dictionary]:
	var state := (load("res://scenes/main.tscn") as PackedScene).get_state()
	var out: Array[Dictionary] = []
	for i in state.get_node_count():
		var props := {}
		for p in state.get_node_property_count(i):
			props[state.get_node_property_name(i, p)] = state.get_node_property_value(i, p)
		if str(props.get("npc_ref", "")) == "":
			continue
		out.append({
			"ref": str(props.get("npc_ref")),
			"bridge": bool(props.get("stand_under_bridge", false)),
			"offset": float(props.get("bridge_offset", 2.0)),
			"along": float(props.get("bridge_along", 9.0)),
		})
	return out


func test_the_player_carries_an_interactor() -> void:
	var packed := load("res://scenes/player.tscn") as PackedScene
	var state := packed.get_state()
	var found := false
	for i in state.get_node_count():
		if state.get_node_name(i) == "Interactor":
			found = true
	assert_bool(found).override_failure_message("player.tscn has no Interactor").is_true()


func test_the_interact_key_is_bound() -> void:
	assert_bool(InputMap.has_action("interact")) \
			.override_failure_message("nothing is bound to interact, so no talk ever opens") \
			.is_true()
	assert_bool(InputMap.action_get_events("interact").is_empty()).is_false()


func test_the_talk_prompt_carries_the_key() -> void:
	assert_str(I18n.t("prompt.talk", {"key": "E"})).contains("E")
	assert_str(I18n.t("prompt.talk", {"key": "E"})).not_contains("{{")


func test_the_panel_belongs_to_the_world_it_was_opened_in() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()

	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())
	assert_object(panel).is_not_null()
	assert_object(panel.get_parent()) \
			.override_failure_message("the panel would survive the scene it was opened in") \
			.is_same(world)
	assert_bool(TalkPanel.is_open()).is_true()

	panel.close()
	_unstage(world, was)


func test_a_panel_freed_out_from_under_the_talk_still_closes_it() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()

	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())
	var ended := [false]
	panel.closed.connect(func() -> void: ended[0] = true)

	world.remove_child(panel)
	panel.free()
	assert_bool(ended[0]) \
			.override_failure_message("the world went away and nobody was told the talk had ended") \
			.is_true()
	assert_bool(TalkPanel.is_open()) \
			.override_failure_message("a freed panel still counts as open, so no talk can start again") \
			.is_false()
	_unstage(world, was)


func test_only_one_conversation_is_open_at_a_time() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()

	var first := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())
	assert_object(TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())).is_null()
	first.close()
	_unstage(world, was)


func test_a_line_is_typed_out_and_can_be_hurried() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	assert_bool(panel.is_typing()) \
			.override_failure_message("the whole line went up at once").is_true()
	panel._process(0.05)
	var part: int = panel._line_label.visible_characters
	assert_int(part).is_greater(0)
	assert_int(part) \
			.override_failure_message("a fiftieth of a second wrote the whole line") \
			.is_less(panel._line_label.text.length())

	panel.skip_typing()
	assert_bool(panel.is_typing()).is_false()
	assert_int(panel._line_label.visible_characters) \
			.override_failure_message("hurrying it up left some of the line hidden") \
			.is_equal(-1)

	panel.close()
	_unstage(world, was)


func test_replies_wait_for_the_line_to_finish() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var state := State.new()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), state)

	panel.skip_typing()
	panel.runner.advance()
	assert_int(panel._choices.get_child_count()).is_greater(0)
	assert_bool(panel._choices.visible) \
			.override_failure_message("the replies were up before the question was") \
			.is_false()

	panel.skip_typing()
	assert_bool(panel._choices.visible).is_true()

	panel.close()
	_unstage(world, was)


func test_a_finished_line_shows_all_of_itself() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	for i in 400:
		if not panel.is_typing():
			break
		panel._process(0.05)
	assert_bool(panel.is_typing()) \
			.override_failure_message("the line never finished typing").is_false()
	assert_str(panel._hint.text) \
			.override_failure_message("nothing told the player how to go on") \
			.contains("E")

	panel.close()
	_unstage(world, was)


func test_the_prompt_names_the_bound_key() -> void:
	assert_str(KeyHint.label(&"interact")) \
			.override_failure_message("interact is bound to E, and the hint should say so") \
			.is_equal("E")
	assert_str(KeyHint.label(&"jump")).is_equal("Space")
	assert_str(KeyHint.label(&"nothing_is_bound_to_this", "?")).is_equal("?")


func test_a_number_key_answers_the_reply_it_is_written_on() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	var wanted := 2
	_to_the_replies(panel)
	assert_str((panel._choices.get_child(wanted - 1) as Button).text) \
			.override_failure_message("the reply does not say which key answers it") \
			.starts_with("%d." % wanted)
	panel._input(_pressing(KEY_1 + wanted - 1))
	var by_key := panel.runner.line_key()
	panel.close()

	var clicked := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())
	_to_the_replies(clicked)
	(clicked._choices.get_child(wanted - 1) as Button).pressed.emit()
	assert_str(by_key) \
			.override_failure_message("the number key and the button it is printed on take different replies") \
			.is_equal(clicked.runner.line_key())

	clicked.close()
	_unstage(world, was)


func test_number_keys_do_nothing_until_the_replies_are_up() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	panel.skip_typing()
	panel.runner.advance()
	var asked := panel.runner.line_key()
	assert_bool(panel.is_typing()).is_true()

	panel._input(_pressing(KEY_1))
	assert_str(panel.runner.line_key()) \
			.override_failure_message("a number answered a question still being asked") \
			.is_equal(asked)

	panel.close()
	_unstage(world, was)


func test_the_panel_finishes_arriving() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	assert_float(panel._root.modulate.a) \
			.override_failure_message("the panel was already up, so it never rose").is_less(1.0)
	await get_tree().create_timer(TalkPanel.ENTER_TIME + 0.1).timeout
	assert_float(panel._root.modulate.a) \
			.override_failure_message("the panel never finished fading in").is_equal_approx(1.0, 0.01)
	assert_float(panel._shell.position.y) \
			.override_failure_message("the panel stopped short of where it belongs") \
			.is_equal_approx(0.0, 0.5)

	panel.close()
	_unstage(world, was)


func test_the_box_is_only_as_tall_as_what_is_in_it() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	panel.skip_typing()
	await get_tree().process_frame
	var plain := panel._frame.size.y

	panel.runner.advance()
	panel.skip_typing()
	await get_tree().process_frame
	assert_float(panel._frame.size.y) \
			.override_failure_message("replies took no more room than no replies, so the box is a fixed slab") \
			.is_greater(plain)

	var view := panel.get_viewport().get_visible_rect().size
	assert_float(panel._frame.size.y) \
			.override_failure_message("a conversation covered half the world it is happening in") \
			.is_less(view.y * 0.6)

	panel.close()
	_unstage(world, was)


func test_replies_arriving_do_not_move_the_line() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	panel.skip_typing()
	panel.runner.advance()
	await get_tree().process_frame
	var while_speaking := panel._frame.size.y
	assert_bool(panel._choices.visible).is_false()

	panel.skip_typing()
	await get_tree().process_frame
	assert_float(panel._frame.size.y) \
			.override_failure_message("the box grew when the replies appeared, moving the line under the reader") \
			.is_equal_approx(while_speaking, 1.0)

	panel.close()
	_unstage(world, was)


func test_the_box_can_be_tapped_to_go_on() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	var greeting := panel.runner.line_key()
	panel._frame.gui_input.emit(_tap())
	assert_bool(panel.is_typing()) \
			.override_failure_message("the first tap skipped the line instead of finishing it") \
			.is_false()
	assert_str(panel.runner.line_key()) \
			.override_failure_message("the first tap went past the line rather than hurrying it") \
			.is_equal(greeting)

	panel._frame.gui_input.emit(_tap())
	assert_str(panel.runner.line_key()) \
			.override_failure_message("a tap on a finished line went nowhere") \
			.is_not_equal(greeting)

	panel.close()
	_unstage(world, was)


func _tap() -> InputEventScreenTouch:
	var touch := InputEventScreenTouch.new()
	touch.pressed = true
	return touch


func test_a_wide_window_keeps_the_line_readable() -> void:
	var wide: Dictionary = TalkPanel.metrics(Vector2(2560.0, 720.0))
	assert_float(wide["width"]) \
			.override_failure_message("the line was ruled the whole way across an ultrawide window") \
			.is_less_equal(TalkPanel.MAX_WIDTH)
	assert_float(wide["side"]) \
			.override_failure_message("the capped box was not centred, so it hangs off one side") \
			.is_equal_approx((2560.0 - float(wide["width"])) * 0.5, 0.5)

	var narrow: Dictionary = TalkPanel.metrics(Vector2(640.0, 900.0))
	assert_float(narrow["side"]) \
			.override_failure_message("desktop margins on a narrow window leave no room for the words") \
			.is_less_equal(TalkPanel.SIDE_RANGE.y)
	assert_float(float(narrow["side"]) * 2.0) \
			.override_failure_message("the margins ate more of the window than the box got") \
			.is_less(640.0 * 0.5)


func test_touch_gets_bigger_words_and_a_reply_a_thumb_can_hit() -> void:
	var view := Vector2(1560.0, 720.0)
	var pointer: Dictionary = TalkPanel.metrics(view, false)
	var thumb: Dictionary = TalkPanel.metrics(view, true)

	assert_int(thumb["line_font"]) \
			.override_failure_message("a phone got the same size words as a monitor an arm closer") \
			.is_greater(int(pointer["line_font"]))
	assert_float(thumb["reply_min_h"]) \
			.override_failure_message("a reply on touch is smaller than a thumb") \
			.is_greater_equal(44.0)
	assert_bool(thumb["reply_fill"]) \
			.override_failure_message("a touch reply is only as wide as its words, so it is a small target") \
			.is_true()
	assert_bool(pointer["reply_fill"]) \
			.override_failure_message("a pointer got full-width slabs, which read as a menu") \
			.is_false()


func test_replies_are_padded_and_line_up() -> void:
	var reply := PaperButton.reply("Pay the toll.", Callable())
	auto_free(reply)
	var skin: StyleBoxFlat = reply.get_theme_stylebox("normal")
	assert_float(skin.content_margin_left) \
			.override_failure_message("the text sits flush against the edge").is_greater(0.0)
	assert_float(skin.content_margin_top).is_greater(0.0)
	assert_int(reply.alignment) \
			.override_failure_message("replies are a list, and a list lines up on the left") \
			.is_equal(HORIZONTAL_ALIGNMENT_LEFT)
	assert_float(reply.custom_minimum_size.x) \
			.override_failure_message("a reply stretched to a menu button's width") \
			.is_equal(0.0)

	var menu := PaperButton.make("Play", Callable())
	auto_free(menu)
	assert_float(menu.custom_minimum_size.x).is_equal(MenuStyle.BUTTON_MIN.x)


func test_menu_padding_leaves_the_settings_rows_room_to_shrink() -> void:
	var row := PaperButton.make("", Callable())
	auto_free(row)
	row.add_theme_font_size_override("font_size", MenuStyle.ROW_FONT_RANGE.x)
	assert_float(row.get_minimum_size().y) \
			.override_failure_message("a padded menu button no longer fits the smallest row") \
			.is_less_equal(MenuStyle.ROW_H_RANGE.x)


func test_a_focused_reply_looks_like_a_hovered_one() -> void:
	var reply := PaperButton.reply("Pay the toll.", Callable())
	auto_free(reply)
	assert_object(reply.get_theme_stylebox("focus")) \
			.override_failure_message("focus wears the default look, which is a plain outline") \
			.is_same(reply.get_theme_stylebox("hover"))


func test_a_conversation_can_be_left_by_clicking() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	var shut: Button = panel._name_label.get_parent().get_node("Close")
	assert_int(shut.focus_mode) \
			.override_failure_message("the way out takes the focus the first reply wants") \
			.is_equal(Control.FOCUS_NONE)

	shut.pressed.emit()
	assert_bool(TalkPanel.is_open()) \
			.override_failure_message("clicking the way out left the conversation up") \
			.is_false()

	_unstage(world, was)


func test_standing_in_front_of_somebody_offers_the_prompt() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var pair := _stage_interactor(world, Vector3(0.0, 0.0, -2.0))
	var reach: Node3D = pair[0]
	var actor: NpcActor = pair[1]

	reach._process(0.0)
	assert_object(reach._target) \
			.override_failure_message("nobody was found standing two metres straight ahead") \
			.is_not_null()
	assert_bool(actor._prompt.visible) \
			.override_failure_message("somebody was in reach and the prompt stayed hidden") \
			.is_true()
	assert_str(actor._prompt.text).contains("E")
	assert_str(actor._prompt.text) \
			.override_failure_message("a placeholder was left in the prompt").not_contains("{{")

	_unstage(world, was)


func test_somebody_named_only_by_the_catalog_still_gets_a_nameplate() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var actor: NpcActor = _stage_interactor(world, Vector3(0.0, 0.0, -2.0))[1]

	assert_object(actor._nameplate) \
			.override_failure_message("the catalog knows his name and nothing showed it") \
			.is_not_null()
	assert_str(actor._nameplate.text).is_equal("Marlow")
	assert_float(actor._prompt.position.y) \
			.override_failure_message("the offer to talk is not under the name") \
			.is_less(actor._nameplate.position.y)

	_unstage(world, was)


func test_the_prompt_keeps_to_reach_and_to_what_is_ahead() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()

	var far := _stage_interactor(world, Vector3(0.0, 0.0, -20.0))
	far[0]._process(0.0)
	assert_bool(far[1]._prompt.visible) \
			.override_failure_message("somebody twenty metres off was offered a conversation") \
			.is_false()

	var behind := _stage_interactor(world, Vector3(0.0, 0.0, 2.0))
	behind[0]._process(0.0)
	assert_bool(behind[1]._prompt.visible) \
			.override_failure_message("the player was offered a talk with somebody at their back") \
			.is_false()

	_unstage(world, was)


func test_walking_away_withdraws_the_offer() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var pair := _stage_interactor(world, Vector3(0.0, 0.0, -2.0))
	var reach: Node3D = pair[0]
	var actor: NpcActor = pair[1]

	reach._process(0.0)
	assert_bool(actor._prompt.visible).is_true()

	actor.global_position = Vector3(0.0, 0.0, -20.0)
	reach._process(0.0)
	assert_bool(actor._prompt.visible) \
			.override_failure_message("the offer followed the player up the bank") \
			.is_false()

	_unstage(world, was)


func test_a_picked_reply_is_said_in_the_players_own_voice() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())
	_to_the_replies(panel)

	var asked := panel.runner.node_id()
	(panel._choices.get_child(_reply_row(panel, TOLL)) as Button).pressed.emit()

	assert_str(panel._line_label.text) \
			.override_failure_message("the reply was taken without ever being said") \
			.is_equal(TOLL)
	assert_str(panel._name_label.text) \
			.override_failure_message("the player's own line was put under somebody else's name") \
			.is_equal(panel._player)
	assert_str(panel.runner.node_id()) \
			.override_failure_message("the answer arrived before the question was finished") \
			.is_equal(asked)

	panel.skip_typing()
	panel._input(_pressing_action(&"interact"))
	assert_str(panel.runner.node_id()) \
			.override_failure_message("finishing the reply did not hand it over") \
			.is_not_equal(asked)

	panel.close()
	_unstage(world, was)


func test_what_a_reply_sets_waits_until_it_has_been_said() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var state := State.new()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), state)

	_to_the_replies(panel)
	(panel._choices.get_child(_reply_row(panel, TOLL)) as Button).pressed.emit()
	panel.skip_typing()
	panel._input(_pressing_action(&"interact"))

	panel.skip_typing()
	(panel._choices.get_child(_reply_row(panel, PAY)) as Button).pressed.emit()
	assert_bool(state.has_flag("marlow_toll_paid")) \
			.override_failure_message("the toll was paid before the player finished offering it") \
			.is_false()

	panel.skip_typing()
	panel._input(_pressing_action(&"interact"))
	assert_bool(state.has_flag("marlow_toll_paid")) \
			.override_failure_message("the reply was said and never acted on") \
			.is_true()

	panel.close()
	_unstage(world, was)


func _reply_row(panel: DialoguePanel, text: String) -> int:
	for i in panel._choices.get_child_count():
		if (panel._choices.get_child(i) as Button).text.ends_with(text):
			return i
	return -1


func test_every_line_marlow_says_arrives_with_the_placeholder_filled() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	var graph := Npcdb.graph(MARLOW)
	var found := false
	for key in graph.text_keys():
		var said := panel._spoken(key)
		assert_str(said) \
				.override_failure_message("'%s' reached the screen with a placeholder in it" % said) \
				.not_contains("{{")
		if key.contains("{{player}}"):
			found = true
			assert_str(said).contains(panel._player)

	assert_bool(found) \
			.override_failure_message("nothing he says uses the player's name, so this proves nothing") \
			.is_true()

	panel.close()
	_unstage(world, was)


func test_marlow_greets_a_regular_and_a_nuisance_differently() -> void:
	var state := State.new()
	state.mark_seen("greet")

	var runner := Runner.new()
	runner.start(Npcdb.graph(MARLOW), state)
	assert_str(runner.node_id()) \
			.override_failure_message("somebody with no standing got a regular's welcome") \
			.is_equal("greet_again")

	state.set_number("respect", 4.0)
	var known := Runner.new()
	known.start(Npcdb.graph(MARLOW), state)
	assert_str(known.node_id()) \
			.override_failure_message("a regular was greeted like a passer-by") \
			.is_equal("greet_known")

	state.set_number("pestered", 3.0)
	var worn := Runner.new()
	worn.start(Npcdb.graph(MARLOW), state)
	assert_str(worn.node_id()) \
			.override_failure_message("asking the same thing all afternoon cost nothing") \
			.is_equal("greet_pestered")


func test_going_over_old_ground_costs_standing_and_learning_earns_it() -> void:
	Journal.forget_everything()
	var who := "test_regard"

	assert_int(int(Journal.regard(who)["talks"])) \
			.override_failure_message("a stranger already had a history") \
			.is_equal(0)

	Journal.remember_talk(who, true)
	assert_int(int(Journal.regard(who)["respect"])).is_equal(1)
	assert_int(int(Journal.regard(who)["pestered"])).is_equal(0)

	Journal.remember_talk(who, false)
	assert_int(int(Journal.regard(who)["respect"])) \
			.override_failure_message("asking once more was treated as pestering") \
			.is_equal(1)

	Journal.remember_talk(who, false)
	Journal.remember_talk(who, false)
	assert_int(int(Journal.regard(who)["respect"])) \
			.override_failure_message("nagging cost nothing") \
			.is_less(1)
	assert_int(int(Journal.regard(who)["talks"])).is_equal(4)

	Journal.remember_talk(who, true)
	assert_int(int(Journal.regard(who)["pestered"])) \
			.override_failure_message("a talk that went somewhere did not clear the slate") \
			.is_equal(0)
	Journal.forget_everything()


func test_what_somebody_makes_of_you_outlives_the_session() -> void:
	Journal.forget_everything()
	Journal.remember_talk("test_kept", true)
	Journal.remember_talk("test_kept", true)
	Journal.save_now()

	Journal.load_now()
	assert_int(int(Journal.regard("test_kept")["respect"])) \
			.override_failure_message("their opinion of the player was forgotten on reload") \
			.is_equal(2)
	Journal.forget_everything()


func test_a_comparison_in_the_catalog_becomes_a_gate() -> void:
	var graph: Dictionary = Npcdb.to_graph_dict({}, {
		"entryNodeId": "a",
		"nodes": [
			{"id": "a", "text": "a", "condition": "respect>=3"},
			{"id": "b", "text": "b", "condition": "!pestered>2"},
			{"id": "c", "text": "c", "condition": "flag:coin"},
		],
	})
	var nodes: Dictionary = graph["nodes"]
	assert_that(nodes["a"]["if"]).is_equal({"num": "respect", "op": ">=", "value": 3.0})
	assert_that(nodes["b"]["if"]).is_equal({"not": {"num": "pestered", "op": ">", "value": 2.0}})
	assert_that(nodes["c"]["if"]) \
			.override_failure_message("a plain flag stopped reading as a flag") \
			.is_equal({"flag": "coin"})


func test_numbers_answer_comparisons() -> void:
	var state := State.new()
	state.set_number("respect", 3.0)
	assert_bool(state.test({"num": "respect", "op": ">=", "value": 3.0})).is_true()
	assert_bool(state.test({"num": "respect", "op": ">", "value": 3.0})).is_false()
	assert_bool(state.test({"num": "respect", "op": "<", "value": 4.0})).is_true()
	assert_bool(state.test({"num": "respect", "op": "==", "value": 3.0})).is_true()
	assert_bool(state.test({"num": "respect", "op": "!=", "value": 3.0})).is_false()
	assert_bool(state.test({"num": "nobody", "op": ">=", "value": 1.0})).is_false()
	assert_bool(state.test({"num": "nobody", "op": "<=", "value": 0.0})).is_true()


func test_standing_is_not_saved_as_a_world_fact() -> void:
	var state := State.new()
	state.set_number("respect", 5.0)
	state.set_flag("coin")
	var body := state.to_dict()
	assert_bool((body["flags"] as Dictionary).has("respect")) \
			.override_failure_message("one person's opinion was written down as a world flag") \
			.is_false()
	var restored := State.new()
	restored.from_dict(body)
	assert_float(restored.number("respect")) \
			.override_failure_message("standing came back from a save it does not belong in") \
			.is_equal(0.0)


func test_a_speaker_moves_while_the_line_is_being_written_and_settles_when_it_lands() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var panel := TalkPanel.open(get_tree(), Npcdb.graph(MARLOW), State.new())

	var beats: Array[String] = []
	panel.speaking.connect(func() -> void: beats.append("speak"))
	panel.listening.connect(func() -> void: beats.append("listen"))

	panel.runner.advance()
	assert_array(beats) \
			.override_failure_message("a new line did not start anybody talking") \
			.contains(["speak"])
	assert_bool(beats.has("listen")) \
			.override_failure_message("they stopped talking before the line was written") \
			.is_false()

	panel.skip_typing()
	assert_array(beats) \
			.override_failure_message("the line landed and nobody was told to stop") \
			.contains(["listen"])

	panel.close()
	_unstage(world, was)


func test_the_speaker_is_already_talking_on_the_opening_line() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()

	var body := Node3D.new()
	world.add_child(body)
	var actor := NpcActor.new()
	actor.npc_ref = MARLOW
	actor.body = load("res://assets/characters/quaternius_ubc/models/Regular_Male_FullBody.glb")
	actor.animation_sources = [
		load("res://assets/characters/quaternius_ubc/animations/UAL1.glb"),
		load("res://assets/characters/quaternius_ubc/animations/UAL2.glb"),
	]
	actor.idle_animation = "UAL1/Idle"
	world.add_child(actor)
	actor.global_position = Vector3(0.0, 0.0, -2.0)

	var reach := Node3D.new()
	reach.set_script(Interactor)
	body.add_child(reach)
	await get_tree().process_frame

	reach.state().set_flag(reach.MET % MARLOW)
	reach._talk_to(actor)
	assert_str(actor.rig.animation.current_animation) \
			.override_failure_message("the speaker stood still through their own opening line") \
			.is_equal(actor.talk_animation)

	reach.state().set_flag(reach.MET % MARLOW, false)
	if TalkPanel.is_open():
		TalkPanel._open.close()
	_unstage(world, was)


func test_meeting_somebody_names_them_before_the_talk_opens() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var pair := _stage_interactor(world, Vector3(0.0, 0.0, -2.0))
	var reach: Node3D = pair[0]
	var actor: NpcActor = pair[1]
	reach.state().set_flag(reach.MET % MARLOW, false)

	reach._talk_to(actor)
	var card := world.get_node_or_null(^"MeetingCard") as MeetingCard
	assert_object(card) \
			.override_failure_message("meeting somebody put no card up") \
			.is_not_null()
	assert_bool(TalkPanel.is_open()) \
			.override_failure_message("the conversation opened underneath the introduction") \
			.is_false()
	assert_str(_card_text(card)) \
			.override_failure_message("the card does not say who was met") \
			.contains("Marlow")

	card.dismiss()
	await get_tree().process_frame
	assert_bool(TalkPanel.is_open()) \
			.override_failure_message("the card cleared and no conversation followed") \
			.is_true()

	reach.state().set_flag(reach.MET % MARLOW, false)
	if TalkPanel.is_open():
		TalkPanel._open.close()
	_unstage(world, was)


func test_a_card_ends_on_its_own_with_nobody_dismissing_it() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var card := MeetingCard.present(get_tree(), "Marlow", "Bridge Keeper")
	var ended := [false]
	card.finished.connect(func() -> void: ended[0] = true)

	await get_tree().create_timer(MeetingCard.length() + 0.4).timeout
	assert_bool(ended[0]) \
			.override_failure_message("the card never finished, so nothing behind it can start") \
			.is_true()
	_unstage(world, was)


func test_a_card_that_dies_without_finishing_still_frees_the_player() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var pair := _stage_interactor(world, Vector3(0.0, 0.0, -2.0))
	var reach: Node3D = pair[0]
	reach.state().set_flag(reach.MET % MARLOW, false)

	reach._talk_to(pair[1])
	assert_bool(reach.busy()) \
			.override_failure_message("a card was up and the player was not held") \
			.is_true()

	var actor: NpcActor = pair[1]
	actor.get_parent().remove_child(actor)
	actor.queue_free()

	var card := world.get_node_or_null(^"MeetingCard")
	card.get_parent().remove_child(card)
	await get_tree().process_frame

	assert_bool(reach.busy()) \
			.override_failure_message("the card is gone and the player is still held -- they can never talk again") \
			.is_false()
	assert_bool(TalkPanel.is_open()) \
			.override_failure_message("a conversation opened with somebody who is not there") \
			.is_false()

	reach.state().set_flag(reach.MET % MARLOW, false)
	_unstage(world, was)


func test_somebody_already_known_gets_no_card() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var pair := _stage_interactor(world, Vector3(0.0, 0.0, -2.0))
	var reach: Node3D = pair[0]
	reach.state().set_flag(reach.MET % MARLOW)

	reach._talk_to(pair[1])
	assert_object(world.get_node_or_null(^"MeetingCard")) \
			.override_failure_message("somebody already known was introduced again") \
			.is_null()
	assert_bool(TalkPanel.is_open()).is_true()

	reach.state().set_flag(reach.MET % MARLOW, false)
	if TalkPanel.is_open():
		TalkPanel._open.close()
	_unstage(world, was)


func _card_text(card: MeetingCard) -> String:
	var words: Array[String] = []
	for node in _labels(card):
		words.append(node.text)
	return " ".join(words)


func _labels(node: Node) -> Array[Label]:
	var out: Array[Label] = []
	if node is Label:
		out.append(node)
	for child in node.get_children():
		out.append_array(_labels(child))
	return out


func test_meeting_somebody_happens_once_and_is_written_down() -> void:
	var was := get_tree().current_scene
	var world := _stage_world()
	var pair := _stage_interactor(world, Vector3(0.0, 0.0, -2.0))
	var reach: Node3D = pair[0]
	var flag: String = reach.MET % MARLOW

	reach.state().set_flag(flag, false)
	assert_bool(reach._first_meeting(pair[1])) \
			.override_failure_message("meeting somebody for the first time was not a first meeting") \
			.is_true()
	assert_bool(reach.state().has_flag(flag)) \
			.override_failure_message("they were met and nobody wrote it down") \
			.is_true()
	assert_bool(reach._first_meeting(pair[1])) \
			.override_failure_message("the same person was met twice") \
			.is_false()

	reach.state().set_flag(flag, false)
	_unstage(world, was)


func test_asking_a_bodiless_npc_to_perform_is_harmless() -> void:
	var actor := NpcActor.new()
	actor.npc_ref = MARLOW
	add_child(actor)
	auto_free(actor)
	actor.talk_animation = "UAL1/NoSuchClipWasEverAuthored"

	actor.speak()
	actor.listen()
	actor.rest()
	assert_float(actor.meet()) \
			.override_failure_message("a body that does not exist played an animation") \
			.is_equal(0.0)


func _to_the_replies(panel: DialoguePanel) -> void:
	panel.skip_typing()
	panel.runner.advance()
	panel.skip_typing()


func _pressing_action(action: StringName) -> InputEvent:
	var bound := InputMap.action_get_events(action)
	assert_bool(bound.is_empty()) \
			.override_failure_message("nothing is bound to %s" % action).is_false()
	var press := bound[0].duplicate() as InputEvent
	press.pressed = true
	return press


func _pressing(code: Key) -> InputEventKey:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	return event


func _stage_interactor(world: Node3D, at: Vector3) -> Array:
	var body := Node3D.new()
	world.add_child(body)

	var actor := NpcActor.new()
	actor.npc_ref = MARLOW
	world.add_child(actor)
	actor.global_position = at

	var reach := Node3D.new()
	reach.set_script(Interactor)
	body.add_child(reach)
	return [reach, actor]


func _stage_world() -> Node3D:
	var world := Node3D.new()
	world.name = "StandInWorld"
	get_tree().root.add_child(world)
	get_tree().current_scene = world
	return world


func _unstage(world: Node3D, was: Node) -> void:
	await get_tree().process_frame
	get_tree().current_scene = was
	get_tree().root.remove_child(world)
	world.free()


func _offers(runner: DialogueRunner, text_key: String) -> bool:
	for choice in runner.choices():
		if choice[&"text"] == text_key:
			return true
	return false


func _index_of(runner: DialogueRunner, text_key: String) -> int:
	for choice in runner.choices():
		if choice[&"text"] == text_key:
			return choice[&"index"]
	return -1
