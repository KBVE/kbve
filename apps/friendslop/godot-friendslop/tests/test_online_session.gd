extends GdUnitTestSuite

## The client half of a server-driven session: which way "forward" is, what a
## remote body looks like, and what the HUD says about a socket nobody can see.

const OnlineWorld = preload("res://src/net/online_world.gd")
const AVATAR_SCENE := "res://scenes/net_avatar.tscn"


func _client() -> NetGameClient:
	var node := NetGameClient.new()
	add_child(node)
	auto_free(node)
	return node


## Input is in screen terms and the wire is in world terms. Facing the default
## -Z, the two agree, so nothing should be rotated.
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

	# "Forward" with the camera turned a quarter turn left is world -X, not -Z.
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


## A body can exist for a frame or two before the roster explains it; an empty
## plate is a blank box floating over someone's head.
func test_a_nameless_body_shows_no_plate() -> void:
	var avatar := _avatar()
	avatar.set_player_name("")
	assert_bool((avatar.get_node("Nameplate") as Label3D).visible).is_false()


## The camera sits on our own avatar, so our own plate would be a label across
## the middle of the screen.
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


## Waiting and broken look identical from outside — an empty world — so the
## difference has to be in words.
func test_the_hud_names_every_state() -> void:
	var hud := _hud()
	hud.set_connecting("wss://friendslop.kbve.com/ws")
	assert_str(hud.status_label.text).contains("Connecting")
	assert_str(hud.status_label.text).contains("friendslop.kbve.com")

	hud.set_joined("Anon-K7QF")
	assert_str(hud.status_label.text).contains("Anon-K7QF")

	hud.set_rejected("protocol 4 != 3")
	assert_str(hud.status_label.text).contains("protocol 4 != 3")


func test_the_roster_marks_which_one_is_us() -> void:
	var hud := _hud()
	hud.set_roster({1000001: "Anon-K7QF", 1000002: "Anon-X5P5"}, 1000002)
	assert_str(hud.roster_label.text).contains("2 here")
	assert_str(hud.roster_label.text).contains("Anon-X5P5 (you)")
	assert_str(hud.roster_label.text).contains("Anon-K7QF")


func test_leaving_is_asked_for_not_done_here() -> void:
	var hud := _hud()
	var asked := [0]
	hud.leave_requested.connect(func() -> void: asked[0] += 1)
	var escape := InputEventAction.new()
	escape.action = &"ui_cancel"
	escape.pressed = true
	hud._unhandled_input(escape)
	assert_int(asked[0]).is_equal(1)


## The deployed fleet is the default; FS_URL is how a local server gets tested
## against a build that otherwise only knows about it.
func test_the_default_server_is_the_deployed_one() -> void:
	assert_str(OnlineWorld.server_url()).is_equal(NetGameClient.DEPLOYED_URL)
	assert_str(NetGameClient.DEPLOYED_URL).starts_with("wss://")
