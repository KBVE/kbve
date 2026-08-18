extends GdUnitTestSuite


const Card := preload("res://src/ui/account_card.gd")
const Auth := preload("res://src/autoload/auth_session.gd")


func _token(claims: Dictionary) -> String:
	var payload := Marshalls.utf8_to_base64(JSON.stringify(claims))
	payload = payload.replace("+", "-").replace("/", "_").rstrip("=")
	return "header." + payload + ".signature"


func test_the_account_id_comes_out_of_the_token() -> void:
	var auth: Node = Auth.new()
	add_child(auth)
	auth.adopt_account(_token({
		"sub": "8b1f7c22-0000-4aaa-9999-1c2d3e4f5a6b",
		"kbve_username": "holy",
	}), "", "refresh", 0)
	assert_str(auth.user_id()).is_equal("8b1f7c22-0000-4aaa-9999-1c2d3e4f5a6b")
	assert_str(auth.requested_name()).is_equal("holy")
	auth.sign_out()
	auth.queue_free()


func test_the_avatar_comes_out_of_the_token() -> void:
	var auth: Node = Auth.new()
	add_child(auth)
	auth.adopt_account(_token({
		"sub": "x",
		"user_metadata": {"avatar_url": "https://cdn.discordapp.com/avatars/1/2.png"},
	}), "", "refresh", 0)
	assert_str(auth.avatar_url()).is_equal("https://cdn.discordapp.com/avatars/1/2.png")
	auth.sign_out()
	auth.queue_free()


func test_a_non_https_avatar_is_refused() -> void:
	var auth: Node = Auth.new()
	add_child(auth)
	for hostile in ["http://example.com/a.png", "file:///etc/passwd", "javascript:alert(1)", ""]:
		auth.adopt_account(_token({"sub": "x", "user_metadata": {"avatar_url": hostile}}),
				"", "refresh", 0)
		assert_str(auth.avatar_url()) \
			.override_failure_message("'%s' was accepted as an avatar" % hostile) \
			.is_equal("")
	auth.sign_out()
	auth.queue_free()


func test_a_token_that_is_not_one_says_nothing() -> void:
	assert_dict(Auth.claims_in("")).is_empty()
	assert_dict(Auth.claims_in("not-a-token")).is_empty()
	assert_dict(Auth.claims_in("a.!!!not-base64!!!.c")).is_empty()
	assert_str(Auth.username_in("nonsense")).is_equal("")


func test_balances_are_grouped() -> void:
	assert_str(Card._grouped(0)).is_equal("0")
	assert_str(Card._grouped(999)).is_equal("999")
	assert_str(Card._grouped(1000)).is_equal("1,000")
	assert_str(Card._grouped(1234567)).is_equal("1,234,567")
	assert_str(Card._grouped(-4200)).is_equal("-4,200")


func test_large_balances_are_abbreviated() -> void:
	assert_str(Card._abbreviated(0)).is_equal("0")
	assert_str(Card._abbreviated(999)).is_equal("999")
	assert_str(Card._abbreviated(1000)).is_equal("1K")
	assert_str(Card._abbreviated(900907)).is_equal("900K")
	assert_str(Card._abbreviated(1500000)).is_equal("1500K")
	assert_str(Card._abbreviated(9999999)).is_equal("9999K")
	assert_str(Card._abbreviated(10000000)).is_equal("10M")
	assert_str(Card._abbreviated(15000000)).is_equal("15M")
	assert_str(Card._abbreviated(15400000)).is_equal("15.4M")
	assert_str(Card._abbreviated(-2500000)).is_equal("-2500K")


func test_an_unread_balance_is_not_shown_as_zero() -> void:
	var card: AccountCard = Card.new()
	add_child(card)
	card.show_account("holy")
	card.show_wallet_error("session expired")
	assert_str(card.wallet_label.text).is_equal("session expired")
	assert_str(card.wallet_label.text).not_contains("0")
	card.queue_free()


func test_a_repeated_avatar_load_does_not_start_a_second_request() -> void:
	var card := Card.new()
	add_child(card)
	auto_free(card)
	await await_idle_frame()
	var url := "https://example.invalid/avatar.png"
	assert_bool(card.load_avatar(url)).is_true()
	assert_bool(card.load_avatar(url)).is_false()
	assert_bool(card.load_avatar(url)).is_false()
	assert_bool(card.load_avatar("https://example.invalid/other.png")) \
			.override_failure_message(
					"a new picture must cancel the open request, not collide with it") \
			.is_true()


func test_a_url_that_is_not_https_is_never_fetched() -> void:
	var card := Card.new()
	add_child(card)
	auto_free(card)
	await await_idle_frame()
	assert_bool(card.load_avatar("")).is_false()
	assert_bool(card.load_avatar("http://example.invalid/a.png")).is_false()
	assert_bool(card.load_avatar("https://example.invalid/a.png")).is_true()


func test_two_accounts_do_not_share_a_cache_file() -> void:
	var mine := Card.cache_path("https://cdn.example.invalid/me.png")
	var theirs := Card.cache_path("https://cdn.example.invalid/them.png")
	assert_str(mine).is_not_equal(theirs)
	assert_str(mine).starts_with(Card.AVATAR_DIR)
	assert_str(Card.cache_path("https://cdn.example.invalid/me.png")).is_equal(mine)


func test_a_cached_picture_is_used_instead_of_a_request() -> void:
	var url := "https://cdn.example.invalid/cached.png"
	var path := Card.cache_path(url)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(Card.AVATAR_DIR))
	var image := Image.create(8, 8, false, Image.FORMAT_RGBA8)
	image.fill(Color.RED)
	assert_int(image.save_png(ProjectSettings.globalize_path(path))).is_equal(OK)

	var card := Card.new()
	add_child(card)
	auto_free(card)
	await await_idle_frame()
	assert_bool(card.load_avatar(url)).override_failure_message(
			"a picture already on disk must not be fetched again").is_false()
	assert_object(card.avatar.texture).is_not_null()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


func test_the_card_never_shows_the_account_uuid() -> void:
	var uuid := "8b1f7c22-0000-4aaa-9999-1c2d3e4f5a6b"
	var card := Card.new()
	add_child(card)
	auto_free(card)
	await await_idle_frame()
	card.show_account("holy")
	card.show_wallet(10, 20)
	for label: Label in _labels_in(card):
		assert_str(label.text).override_failure_message(
				"a label on the card is rendering the account id").not_contains(uuid)
		assert_str(label.text).not_contains("8b1f7c22")


func _labels_in(node: Node) -> Array[Label]:
	var found: Array[Label] = []
	if node is Label:
		found.append(node)
	for child in node.get_children():
		found.append_array(_labels_in(child))
	return found
