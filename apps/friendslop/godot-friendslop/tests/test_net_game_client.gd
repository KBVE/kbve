extends GdUnitTestSuite

## Covers the client wiring, not the network.


func _client() -> NetGameClient:
	var node := NetGameClient.new()
	add_child(node)
	auto_free(node)
	return node


func test_extension_class_is_available() -> void:
	assert_bool(ClassDB.class_exists("QNetClient3D")).is_true()
	assert_bool(ClassDB.class_exists("QPhysics3D")).is_true()


func test_starts_disconnected() -> void:
	var client := _client()
	assert_bool(client.is_joined()).is_false()
	assert_int(client.snapshot_tick()).is_equal(0)
	assert_object(client.local_avatar()).is_null()


## Guest mode asks for nothing and the server answers; anything shown before that would
## be a name the server never granted.
func test_guest_mode_requests_no_name() -> void:
	var client := _client()
	assert_str(client.player_name).is_empty()
	assert_str(client.local_name()).is_empty()
	assert_dict(client.roster()).is_empty()


func test_body_name_is_empty_for_an_unknown_body() -> void:
	assert_str(_client().body_name(1000042)).is_empty()


## Before the host welcomes us there is no body, and guessing one would render another
## player's character.
func test_local_body_is_unassigned_until_welcomed() -> void:
	assert_int(_client().local_body()).is_equal(-1)


func test_avatar_is_spawned_and_freed_with_its_body() -> void:
	var client := _client()
	var before := client.get_child_count()

	client._on_body_added(42)
	assert_int(client.get_child_count()).is_equal(before + 1)
	assert_object(client.get_node_or_null("Body42")).is_not_null()

	client._on_body_added(42)
	assert_int(client.get_child_count()).is_equal(before + 1)

	client._on_body_removed(42)
	await await_idle_frame()
	assert_object(client.get_node_or_null("Body42")).is_null()


func test_removing_an_unknown_body_is_harmless() -> void:
	var client := _client()
	var before := client.get_child_count()
	client._on_body_removed(999)
	assert_int(client.get_child_count()).is_equal(before)


func test_disconnect_clears_every_avatar() -> void:
	var client := _client()
	client._on_body_added(1)
	client._on_body_added(2)
	client.disconnect_from_server()
	await await_idle_frame()
	assert_object(client.get_node_or_null("Body1")).is_null()
	assert_object(client.get_node_or_null("Body2")).is_null()
	assert_bool(client.is_joined()).is_false()
