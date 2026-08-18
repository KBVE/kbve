extends GdUnitTestSuite


const Catalog := preload("res://src/quest/questdb_quests.gd")

const PLANK := "friendslop-third-plank"
const BITTERROOT := "friendslop-bitterroot"
const MECHS := "friendslop-mech-watch"

const TOLL_PAID := "marlow_toll_paid"
const BITTERROOT_TAUGHT := "wren_taught_bitterroot"

var _was: Dictionary = {}
var _was_quests: Dictionary = {}


func before_test() -> void:
	_was = Journal.state().to_dict()
	_was_quests = Journal.quest_records()
	Journal.forget_everything()


func after_test() -> void:
	Journal.state().from_dict(_was)
	for ref: Variant in _was_quests:
		Journal.set_quest_record(str(ref), _was_quests[ref])
	Journal.save_now()


func test_only_this_games_quests_are_read() -> void:
	var refs: Array[String] = []
	for quest in Quests.catalog():
		refs.append(str(quest["ref"]))

	assert_array(refs).contains([PLANK, BITTERROOT, MECHS])
	assert_array(refs) \
			.override_failure_message("somebody else's quest turned up in ours") \
			.not_contains(["slime-slayer", "dungeon-delver"])


func test_every_quest_arrives_with_a_name() -> void:
	for quest in Quests.catalog():
		assert_str(str(quest["title"])) \
				.override_failure_message("%s has no title" % quest["ref"]) \
				.is_not_equal(str(quest["ref"]))
		for step: Dictionary in quest["steps"]:
			assert_str(str(step["title"])) \
					.override_failure_message("a step of %s has no title" % quest["ref"]) \
					.is_not_empty()


func test_the_catalogs_vocabulary_stops_at_the_reader() -> void:
	var quest := Quests.definition(PLANK)
	assert_str(str(quest["category"])).is_equal("tutorial")
	var first: Dictionary = quest["steps"][0]
	assert_str(str(first["objectives"][0]["type"])).is_equal("interact")


func test_a_quest_nobody_has_taken_on_is_there_to_take() -> void:
	assert_int(Quests.status(PLANK)).is_equal(Quests.Status.AVAILABLE)
	assert_bool(Quests.accept(PLANK)).is_true()
	assert_int(Quests.status(PLANK)).is_equal(Quests.Status.ACTIVE)
	assert_bool(Quests.accept(PLANK)) \
			.override_failure_message("the same quest was taken on twice").is_false()


func test_a_quest_behind_a_flag_is_not_offered_until_the_flag_is_set() -> void:
	assert_int(Quests.status(BITTERROOT)) \
			.override_failure_message("a quest was offered before its gate was met") \
			.is_equal(Quests.Status.UNKNOWN)
	Journal.set_flag("met_wren")
	assert_int(Quests.status(BITTERROOT)).is_equal(Quests.Status.AVAILABLE)


func test_accepting_from_somebody_counts_as_talking_to_them() -> void:
	Journal.talking_to("marlow")
	Quests.accept(PLANK)
	Journal.talking_to("")

	assert_str(Quests.step_id(PLANK)) \
			.override_failure_message("the step the player was standing in did not advance") \
			.is_equal("step-pay-the-toll")


func test_a_quest_is_finished_by_going_back_to_whoever_asked() -> void:
	Journal.talking_to("marlow")
	Quests.accept(PLANK)
	Journal.talking_to("")

	Journal.set_flag(TOLL_PAID)
	assert_int(Quests.status(PLANK)) \
			.override_failure_message("paying the toll did not finish the step it is the whole of") \
			.is_equal(Quests.Status.COMPLETE)

	var experience := Vitals.experience(Vitals.PLAYER)
	Quests.met("marlow")
	assert_int(Quests.status(PLANK)).is_equal(Quests.Status.TURNED_IN)
	assert_int(Journal.regard("marlow")["respect"]) \
			.override_failure_message("handing the job back was worth nothing to him") \
			.is_greater(0)
	assert_int(experience).is_greater_equal(0)


func test_a_quest_is_not_handed_back_to_a_stranger() -> void:
	Journal.talking_to("marlow")
	Quests.accept(PLANK)
	Journal.talking_to("")
	Journal.set_flag(TOLL_PAID)

	Quests.met("wren")
	assert_int(Quests.status(PLANK)) \
			.override_failure_message("somebody who never asked for it took the job back") \
			.is_equal(Quests.Status.COMPLETE)


func test_a_step_already_satisfied_is_not_waited_for() -> void:
	Journal.set_flag("met_wren")
	Journal.set_flag(BITTERROOT_TAUGHT)

	Journal.talking_to("wren")
	Quests.accept(BITTERROOT)
	Journal.talking_to("")

	assert_str(Quests.step_id(BITTERROOT)) \
			.override_failure_message("the quest sat on a step the world had already answered") \
			.is_equal("step-carry-word")


func test_a_conversation_can_be_gated_on_a_quest() -> void:
	var state := DialogueState.new()
	Quests.brief(state)
	assert_float(state.number("quest.%s" % PLANK)).is_equal(float(Quests.Status.AVAILABLE))

	Quests.accept(PLANK)
	Quests.brief(state)
	assert_float(state.number("quest.%s" % PLANK)).is_equal(float(Quests.Status.ACTIVE))


func test_marlow_offers_the_crossing_until_it_is_taken_on() -> void:
	var graph := NpcdbDialogue.graph("marlow")
	var state := DialogueState.new()
	Quests.brief(state)
	assert_bool(_offers(graph, state)) \
			.override_failure_message("the job was never offered").is_true()

	Quests.accept(PLANK)
	Quests.brief(state)
	assert_bool(_offers(graph, state)) \
			.override_failure_message("a job already in hand was offered again").is_false()


func _offers(graph: DialogueGraph, state: DialogueState) -> bool:
	var node := graph.node("menu")
	for choice: Dictionary in node.get("choices", []):
		if str(choice.get("to", "")) != "crossing_work":
			continue
		return state.test(choice.get("if", null))
	return false


func test_where_a_quest_has_got_to_outlives_the_session() -> void:
	Journal.talking_to("marlow")
	Quests.accept(PLANK)
	Journal.talking_to("")
	Journal.save_now()

	Journal.load_now()
	assert_int(Quests.status(PLANK)).is_equal(Quests.Status.ACTIVE)
	assert_str(Quests.step_id(PLANK)).is_equal("step-pay-the-toll")


func test_a_conversation_carries_out_what_it_asks_for() -> void:
	var state := DialogueState.new()
	var heard: Array = []
	state.asked.connect(func(verb: String, argument: String) -> void:
		heard.append([verb, argument]))

	state.apply({"set": "a_flag", "quest_start": PLANK, "xp": "25"})

	assert_bool(state.has_flag("a_flag")).is_true()
	assert_array(heard).contains([["quest_start", PLANK], ["xp", "25"]])


func test_the_catalog_spells_out_what_a_line_does() -> void:
	var entry := NpcdbDialogue.npc("marlow")
	var tree: Variant = entry.get("dialogueTree", entry.get("dialogue_tree", null))
	var graph := NpcdbDialogue.to_graph_dict(entry, tree)
	var node: Dictionary = graph["nodes"]["crossing_work"]
	assert_dict(node.get("do", {})) \
			.override_failure_message("the line that offers the job asks for nothing") \
			.contains_keys(["quest_start"])
