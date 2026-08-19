extends GdUnitTestSuite


const OnlineWorld = preload("res://src/net/online_world.gd")
const AVATAR_SCENE := "res://scenes/net_avatar.tscn"


func _client() -> NetGameClient:
	var node := NetGameClient.new()
	add_child(node)
	auto_free(node)
	return node


func test_intent_is_unrotated_without_a_basis() -> void:
	var client := _client()
	assert_vector(client._world_wish(Vector2(0, -1))).is_equal(Vector2(0, -1))


func test_intent_follows_where_the_camera_is_looking() -> void:
	var client := _client()
	var basis_node := Node3D.new()
	add_child(basis_node)
	auto_free(basis_node)
	basis_node.rotation.y = PI / 2.0
	client.intent_basis_path = client.get_path_to(basis_node)

	var wish := client._world_wish(Vector2(0, -1))
	assert_float(wish.x).is_equal_approx(-1.0, 0.001)
	assert_float(wish.y).is_equal_approx(0.0, 0.001)


func test_a_still_player_sends_no_direction_at_all() -> void:
	var client := _client()
	var basis_node := Node3D.new()
	add_child(basis_node)
	auto_free(basis_node)
	basis_node.rotation.y = 1.234
	client.intent_basis_path = client.get_path_to(basis_node)
	assert_vector(client._world_wish(Vector2.ZERO)).is_equal(Vector2.ZERO)


func _avatar() -> NetAvatar:
	var scene := load(AVATAR_SCENE) as PackedScene
	var avatar := scene.instantiate() as NetAvatar
	add_child(avatar)
	auto_free(avatar)
	return avatar


func test_a_remote_body_wears_its_name() -> void:
	var avatar := _avatar()
	avatar.set_player_name("Anon-K7QF")
	var plate := avatar.get_node("Nameplate") as Label3D
	assert_str(plate.text).is_equal("Anon-K7QF")
	assert_bool(plate.visible).is_true()


func test_a_nameless_body_shows_no_plate() -> void:
	var avatar := _avatar()
	avatar.set_player_name("")
	assert_bool((avatar.get_node("Nameplate") as Label3D).visible).is_false()


func test_our_own_avatar_never_shows_a_plate() -> void:
	var avatar := _avatar()
	avatar.mark_local()
	avatar.set_player_name("Anon-K7QF")
	assert_bool((avatar.get_node("Nameplate") as Label3D).visible).is_false()


func _hud() -> OnlineHud:
	var hud := OnlineHud.new()
	add_child(hud)
	auto_free(hud)
	return hud


func test_the_hud_names_every_state() -> void:
	var hud := _hud()
	hud.set_connecting("wss://friendslop.kbve.com/ws")
	assert_str(hud.status_label.text).is_equal(
			I18n.t("hud.connecting", {"url": "wss://friendslop.kbve.com/ws"}))
	assert_str(hud.status_label.text).contains("friendslop.kbve.com")

	hud.set_joined("Anon-K7QF")
	assert_str(hud.status_label.text).contains("Anon-K7QF")

	hud.set_rejected("protocol 4 != 3")
	assert_str(hud.status_label.text).contains("protocol 4 != 3")


func test_the_roster_marks_which_one_is_us() -> void:
	var hud := _hud()
	hud.set_roster({1000001: "Anon-K7QF", 1000002: "Anon-X5P5"}, 1000002)
	assert_str(hud.roster_label.text).contains("2")
	assert_str(hud.roster_label.text).contains(I18n.t("hud.roster_you", {"name": "Anon-X5P5"}))
	assert_str(hud.roster_label.text).contains("Anon-K7QF")


func test_the_hud_does_not_take_escape() -> void:
	# Escape used to leave the server outright from here. It belongs to the pause
	# menu now, so the HUD must not be listening for it at all — a handler that
	# merely stopped emitting would still swallow the key from whatever does.
	var hud := _hud()
	assert_bool(hud.has_method("_unhandled_input")).is_false()
	assert_bool(hud.has_signal("leave_requested")).is_false()


func test_the_online_world_has_a_pause_menu_for_escape_to_open() -> void:
	# Structural, against the scene file: instancing the online world stands up
	# terrain and a net client, which a unit test has no business doing.
	var text := FileAccess.get_file_as_string("res://scenes/online.tscn")
	assert_str(text).contains('[node name="PauseMenu" type="CanvasLayer" parent="."]')
	assert_str(text).contains("res://src/ui/pause_menu.gd")


func test_the_default_server_is_the_deployed_one() -> void:
	assert_str(OnlineWorld.server_url()).is_equal(NetGameClient.DEPLOYED_URL)
	assert_str(NetGameClient.DEPLOYED_URL).starts_with("wss://")
