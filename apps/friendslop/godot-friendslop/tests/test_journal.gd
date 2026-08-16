extends GdUnitTestSuite

## What the world remembers of what was said to it.

const Graph := preload("res://src/dialogue/dialogue_graph.gd")
const State := preload("res://src/dialogue/dialogue_state.gd")
const Runner := preload("res://src/dialogue/dialogue_runner.gd")
const Npcdb := preload("res://src/dialogue/npcdb_dialogue.gd")

const MARLOW := "marlow"
const PAID := "marlow_toll_paid"

var _was: Dictionary = {}


## The journal is a real file in user://, and these tests write to it. Put back whatever
## the player had afterwards.
func before_test() -> void:
	_was = Journal.state().to_dict()
	Journal.forget_everything()


func after_test() -> void:
	Journal.state().from_dict(_was)
	Journal.save_now()


## A flag that only moved is not news, or a graph that re-sets the same flag on every pass
## through a node reports it each time.
func test_only_a_flag_that_moves_is_announced() -> void:
	var state := State.new()
	var heard: Array = []
	state.flag_changed.connect(func(name: String, on: bool) -> void: heard.append([name, on]))

	state.set_flag("a")
	state.set_flag("a")
	assert_int(heard.size()) \
			.override_failure_message("setting a flag twice was announced twice").is_equal(1)

	state.set_flag("a", false)
	state.set_flag("a", false)
	assert_int(heard.size()).is_equal(2)
	assert_bool(heard[1][1]).is_false()


func test_a_node_is_only_ever_first_seen_once() -> void:
	var state := State.new()
	var heard: Array = []
	state.seen_changed.connect(func(id: String) -> void: heard.append(id))

	state.mark_seen("greet")
	state.mark_seen("greet")
	assert_int(heard.size()).is_equal(1)


## The point of the whole thing: a toll paid last night is still paid this morning.
func test_a_paid_toll_survives_the_game_being_shut_down() -> void:
	Journal.set_flag(PAID)
	assert_bool(Journal.has_flag(PAID)).is_true()

	## What a restart amounts to: the file is all that carries over.
	Journal.state().clear()
	assert_bool(Journal.has_flag(PAID)).is_false()
	Journal.load_now()

	assert_bool(Journal.has_flag(PAID)) \
			.override_failure_message("Marlow forgot the toll overnight").is_true()


func test_nodes_already_heard_survive_too() -> void:
	Journal.state().mark_seen("greet")
	Journal.state().clear()
	Journal.load_now()
	assert_bool(Journal.state().has_seen("greet")) \
			.override_failure_message("he introduces himself again every time the game starts") \
			.is_true()


## Loading is not the player doing all of it again, so nothing goes out on the bus for it.
func test_loading_the_journal_is_not_announced() -> void:
	Journal.set_flag(PAID)
	var heard: Array = []
	Journal.flag_changed.connect(func(name: String, _on: bool) -> void: heard.append(name))
	Journal.state().clear()
	Journal.load_now()
	assert_array(heard) \
			.override_failure_message("reading the save file read as the player doing it again") \
			.is_empty()


## Anything that is not a conversation can hear about one.
func test_a_flag_set_in_a_talk_reaches_the_event_bus() -> void:
	var heard: Array = []
	var listener := func(payload: Variant) -> void: heard.append(payload)
	Game.events.add_callable(EventNames.FLAG_CHANGED, listener)

	var runner := Runner.new()
	runner.start(Npcdb.graph(MARLOW), Journal.state())
	Journal.set_flag(PAID)

	Game.events.remove_callable(EventNames.FLAG_CHANGED, listener)
	assert_int(heard.size()) \
			.override_failure_message("a flag moved and nothing outside the talk could tell") \
			.is_greater(0)
	assert_str(str(heard[0])) \
			.override_failure_message("the event went out without saying which flag moved") \
			.contains(PAID)


## One journal, so a second talker is talking to somebody who remembers the first.
func test_the_interactor_reads_the_shared_journal() -> void:
	var body := Node3D.new()
	add_child(body)
	auto_free(body)
	var reach := Node3D.new()
	reach.set_script(preload("res://src/player/interactor.gd"))
	body.add_child(reach)

	assert_object(reach.state()) \
			.override_failure_message("the player carries a private memory the world cannot see") \
			.is_same(Journal.state())


## Marlow's opening is gated on having heard it, so the flags surviving a restart is what
## makes him greet a regular differently.
func test_marlow_greets_a_stranger_and_a_regular_differently() -> void:
	var graph := Npcdb.graph(MARLOW)
	var stranger := Runner.new()
	stranger.start(graph, Journal.state())
	var first := stranger.line_key()

	Journal.save_now()
	Journal.state().clear()
	Journal.load_now()

	var regular := Runner.new()
	regular.start(graph, Journal.state())
	assert_str(regular.line_key()) \
			.override_failure_message("he introduced himself to somebody he had already met") \
			.is_not_equal(first)
