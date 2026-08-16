extends GdUnitTestSuite

## What the world remembers of what was said to it.

const Graph := preload("res://src/dialogue/dialogue_graph.gd")
const State := preload("res://src/dialogue/dialogue_state.gd")
const Runner := preload("res://src/dialogue/dialogue_runner.gd")
const Npcdb := preload("res://src/dialogue/npcdb_dialogue.gd")

const MARLOW := "marlow"
const PAID := "marlow_toll_paid"

var _was: Dictionary = {}
var _was_satchel: Dictionary = {}


## The journal is a real file in user://, and these tests write to it. Put back whatever
## the player had afterwards.
func before_test() -> void:
	_was = Journal.state().to_dict()
	_was_satchel = Journal.satchel()
	Journal.forget_everything()


func after_test() -> void:
	Journal.state().from_dict(_was)
	for ref: StringName in _was_satchel:
		Journal.gain(ref, int(_was_satchel[ref]))
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


## The other half of the same promise: a morning's chopping is still in the bag at night.
func test_the_satchel_survives_the_game_being_shut_down() -> void:
	assert_int(Journal.gain(&"log", 3)).is_equal(0)
	assert_int(Journal.count_of(&"log")).is_equal(3)

	## What a restart amounts to: the file is all that carries over.
	Journal.forget_everything()
	assert_int(Journal.count_of(&"log")).is_equal(0)
	Journal.gain(&"log", 3)
	Journal.load_now()

	assert_int(Journal.count_of(&"log")) \
			.override_failure_message("the satchel emptied itself overnight").is_equal(3)


func test_gaining_the_same_thing_twice_stacks() -> void:
	Journal.gain(&"log", 2)
	Journal.gain(&"log", 3)
	assert_int(Journal.count_of(&"log")).is_equal(5)


## A typo'd drop should read as nothing arriving rather than as a phantom item that no
## UI can draw and no recipe can spend.
func test_an_item_the_itemdb_never_heard_of_is_refused() -> void:
	assert_int(Journal.gain(&"unobtainium", 1)) \
			.override_failure_message("an item nobody has heard of was taken anyway").is_equal(1)
	assert_int(Journal.count_of(&"unobtainium")).is_equal(0)


## All or nothing: a recipe that half-pays for itself is worse than one that does not fire.
func test_spending_more_than_is_held_takes_nothing() -> void:
	Journal.gain(&"log", 2)
	assert_bool(Journal.spend(&"log", 5)).is_false()
	assert_int(Journal.count_of(&"log")) \
			.override_failure_message("a refused spend still took some").is_equal(2)

	assert_bool(Journal.spend(&"log", 2)).is_true()
	assert_int(Journal.count_of(&"log")).is_equal(0)


## The news is what arrived, not the running total, so a pickup line can say "+3".
func test_gaining_announces_what_came_in() -> void:
	var heard: Array = []
	Journal.gained.connect(
			func(ref: StringName, count: int, total: int) -> void: heard.append([ref, count, total]))
	Journal.gain(&"log", 2)
	Journal.gain(&"log", 3)

	assert_int(heard.size()).is_equal(2)
	assert_array(heard[0]).is_equal([&"log", 2, 2])
	assert_array(heard[1]).is_equal([&"log", 3, 5])


## Stacks fill before new ones open, or a bag fragments into part-full cells of the same
## thing while there is still room in one.
func test_a_part_full_stack_is_topped_up_before_a_new_one_opens() -> void:
	var cap := Itemdb.max_stack(&"log")
	Journal.gain(&"log", cap - 1)
	assert_int(Journal.stacks().size()).is_equal(1)

	Journal.gain(&"log", 2)
	assert_int(Journal.count_of(&"log")).is_equal(cap + 1)
	assert_int(Journal.stacks().size()) \
			.override_failure_message("a second stack opened while the first had room") \
			.is_equal(2)


## The bag is finite, which is the point of a grid. What will not fit comes back rather
## than disappearing.
func test_what_will_not_fit_is_handed_back() -> void:
	var cap := Itemdb.max_stack(&"log")
	var cells := Journal.COLS * Journal.ROWS
	# One more stack than there are cells to put stacks in.
	var spare := Journal.gain(&"log", cap * (cells + 1))

	assert_int(spare) \
			.override_failure_message("the bag swallowed more than it has cells for") \
			.is_equal(cap)
	assert_int(Journal.count_of(&"log")).is_equal(cap * cells)


func test_a_refused_gain_says_what_bounced() -> void:
	var heard: Array = []
	Journal.refused.connect(func(ref: StringName, count: int) -> void: heard.append([ref, count]))
	var cap := Itemdb.max_stack(&"log")
	var cells := Journal.COLS * Journal.ROWS
	Journal.gain(&"log", cap * (cells + 1))

	assert_int(heard.size()) \
			.override_failure_message("loot bounced off a full bag and nothing said so") \
			.is_equal(1)
	assert_array(heard[0]).is_equal([&"log", cap])


## Every stack sits somewhere, and nothing sits on top of anything else.
func test_stacks_never_overlap() -> void:
	for i in 12:
		Journal.gain(&"log", Itemdb.max_stack(&"log"))
	var taken := {}
	for stack: Dictionary in Journal.stacks():
		var size := Itemdb.grid_size(stack["ref"])
		for dy in size.y:
			for dx in size.x:
				var cell := Vector2i(int(stack["x"]) + dx, int(stack["y"]) + dy)
				assert_bool(taken.has(cell)) \
						.override_failure_message("two stacks share cell %s" % cell).is_false()
				taken[cell] = true


func test_a_stack_can_be_moved_to_a_free_cell_but_not_onto_another() -> void:
	var cap := Itemdb.max_stack(&"log")
	Journal.gain(&"log", cap)
	Journal.gain(&"log", cap)
	var first: Dictionary = Journal.stacks()[0]
	var second: Dictionary = Journal.stacks()[1]

	assert_bool(Journal.move_stack(0, Vector2i(Journal.COLS - 1, Journal.ROWS - 1))) \
			.override_failure_message("a stack would not move to an empty corner").is_true()
	assert_bool(Journal.move_stack(0, Vector2i(int(second["x"]), int(second["y"])))) \
			.override_failure_message("a stack was dropped on top of another").is_false()
	assert_bool(Journal.move_stack(0, Vector2i(Journal.COLS, 0))) \
			.override_failure_message("a stack was moved off the edge of the bag").is_false()
	assert_int(first["count"]).is_equal(cap)


## Where things sit is part of what the player owns, so it survives with the rest.
func test_the_arrangement_survives_a_restart() -> void:
	Journal.gain(&"log", Itemdb.max_stack(&"log"))
	Journal.move_stack(0, Vector2i(4, 3))
	Journal.load_now()

	var stack: Dictionary = Journal.stacks()[0]
	assert_int(int(stack["x"])).is_equal(4)
	assert_int(int(stack["y"])) \
			.override_failure_message("the bag rearranged itself overnight").is_equal(3)


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
