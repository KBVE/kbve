extends GdUnitTestSuite


const AVATAR := "res://scenes/net_avatar.tscn"
const ONLINE := "res://scenes/online.tscn"


func _avatar() -> Node3D:
	var scene: PackedScene = load(AVATAR)
	var node: Node3D = auto_free(scene.instantiate())
	add_child(node)
	return node


## Online the rocks and trees are drawn from the seed and owned by the host's ledger.
## Nothing on this side sends a chop or applies one until a tool exists to do it, so
## without this the whole world is scenery: swing at a tree and nothing happens, and a
## tree somebody else fells stays standing here forever.
func test_the_player_we_are_driving_carries_a_harvester() -> void:
	var mine := _avatar()
	mine.mark_local()
	assert_object(mine.get_node_or_null(^"Harvester")) \
		.override_failure_message("the local avatar has nothing to swing") \
		.is_not_null()


## And only that one. The tool reads local input and aims down the local camera, so a
## copy riding every remote body would swing whenever this player does, at whatever
## this player is looking at.
func test_nobody_elses_body_carries_one() -> void:
	var theirs := _avatar()
	assert_object(theirs.get_node_or_null(^"Harvester")) \
		.override_failure_message("a remote avatar is holding an axe") \
		.is_null()


## The host says each harvest exactly once -- as a delta when it lands, or in the ledger
## it replays on join. The tool that listens is built on an avatar, and the avatar
## arrives in a snapshot after that ledger, so the join's whole history is said before
## anything is listening. It has to be able to ask again.
func test_a_tool_that_arrives_late_can_ask_what_it_missed() -> void:
	var client: Node = auto_free(ClassDB.instantiate(&"QNetClient3D"))
	assert_bool(client.has_method(&"replay_harvest")) \
		.override_failure_message("a late listener has no way to learn what it missed") \
		.is_true()

	var wrapper := FileAccess.get_file_as_string("res://src/net/net_game_client.gd")
	assert_bool(wrapper.contains("func replay_harvest")) \
		.override_failure_message("NetGameClient does not pass the replay through") \
		.is_true()

	var tool := FileAccess.get_file_as_string("res://src/player/harvester.gd")
	assert_bool(tool.contains("replay_harvest()")) \
		.override_failure_message(
			"the harvester never asks, so a player joining a felled wood sees trees") \
		.is_true()


## The tool finds its fields off the world root by name, and the host's ledger is keyed
## to those same fields. An online world missing either is a world where every chop is
## applied to nothing.
func test_the_online_world_has_the_fields_the_tool_looks_for() -> void:
	var state: SceneState = (load(ONLINE) as PackedScene).get_state()
	var names: Array[String] = []
	for i in state.get_node_count():
		names.append(String(state.get_node_name(i)))
	for wanted in ["StoneField", "TreeField"]:
		assert_bool(names.has(wanted)) \
			.override_failure_message("online.tscn has no %s to harvest" % wanted) \
			.is_true()
