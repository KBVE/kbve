extends GdUnitTestSuite

## The conversation layer, held to what it answers rather than what it draws.

const Graph := preload("res://src/dialogue/dialogue_graph.gd")
const State := preload("res://src/dialogue/dialogue_state.gd")
const Runner := preload("res://src/dialogue/dialogue_runner.gd")

const MARLOW := "res://assets/dialogue/marlow.json"

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


## Advancing past a question would answer it for the player.
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


## A choice with nowhere to go is how "walk away" is written.
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


## The index a caller gets back is the authored one, so a filtered list cannot slide the
## answers under the questions.
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


## A graph whose gates all fail in a ring would hang the game on the frame it opened.
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


## A jump to a node that is not there reads in game as a talk that simply stops, so it is
## caught when the graph loads rather than when a player finds it.
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


func test_marlow_loads_clean() -> void:
	var graph := Graph.from_path(MARLOW)
	assert_str("\n".join(graph.errors())).is_empty()


## Every key the graph asks for has to exist in English, or Marlow says a key aloud.
func test_every_line_marlow_has_is_written_in_english() -> void:
	var graph := Graph.from_path(MARLOW)
	for key in graph.text_keys():
		assert_str(I18n.t(key)) \
				.override_failure_message("marlow.json asks for '%s', which English does not have" % key) \
				.is_not_equal(key)


## Paying the toll changes what he offers and how he says goodbye, which is the whole
## point of carrying flags around.
func test_the_toll_changes_what_marlow_offers_afterwards() -> void:
	var state := State.new()
	var runner := Runner.new()
	runner.start(Graph.from_path(MARLOW), state)

	assert_str(runner.line_key()).is_equal("npc.marlow.greet")
	runner.advance()
	assert_str(runner.node_id()).is_equal("menu")
	assert_bool(_offers(runner, "dlg.marlow.ask_toll")).is_true()
	assert_bool(_offers(runner, "dlg.marlow.ask_mechs")).is_false()

	runner.choose(_index_of(runner, "dlg.marlow.ask_toll"))
	runner.choose(_index_of(runner, "dlg.marlow.pay"))
	assert_bool(state.has_flag("marlow_toll_paid")).is_true()
	runner.advance()

	assert_str(runner.node_id()).is_equal("menu")
	assert_bool(_offers(runner, "dlg.marlow.ask_toll")) \
			.override_failure_message("he asked for the toll twice").is_false()
	assert_bool(_offers(runner, "dlg.marlow.ask_mechs")).is_true()

	runner.choose(_index_of(runner, "dlg.leave"))
	assert_str(runner.line_key()).is_equal("npc.marlow.farewell_paid")


## Second time through he does not introduce himself again.
func test_marlow_greets_a_stranger_differently_to_a_regular() -> void:
	var state := State.new()
	var runner := Runner.new()
	runner.start(Graph.from_path(MARLOW), state)
	assert_str(runner.line_key()).is_equal("npc.marlow.greet")

	var again := Runner.new()
	again.start(Graph.from_path(MARLOW), state)
	assert_str(again.line_key()) \
			.override_failure_message("he introduced himself to someone he had already met") \
			.is_equal("npc.marlow.greet_again")


## Marlow is placed in the world scene, not spawned by a script, so the wiring is what
## keeps him from being a node that stands there with nothing to say.
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
		assert_str(str(props.get("dialogue_path", ""))).is_equal(MARLOW)
		assert_str(str(props.get("display_name_key", ""))).is_equal("npc.marlow.name")
		assert_object(props.get("body")) \
				.override_failure_message("Marlow has no body, so he is an invisible voice") \
				.is_not_null()
		assert_bool(bool(props.get("stand_under_bridge", false))) \
				.override_failure_message("Marlow was left wherever the scene was saved") \
				.is_true()
	assert_bool(found).override_failure_message("main.tscn has no Marlow").is_true()


## Without the interactor on the player there is nobody to notice him.
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


## The prompt names whoever is in reach, which needs the placeholder to survive
## translation.
func test_the_talk_prompt_names_the_speaker() -> void:
	assert_str(I18n.t("prompt.talk", {"name": "Marlow"})).contains("Marlow")


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
