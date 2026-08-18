extends GdUnitTestSuite

## Guards what the title screen says about the signed-in player.

const Card := preload("res://src/ui/account_card.gd")
const Auth := preload("res://src/autoload/auth_session.gd")


## Base64url with the padding stripped, which is the shape a real token arrives in.
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


## Discord and GitHub write the picture into the token's own metadata, so there is no
## call to make for it.
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


## An avatar URL is fetched, so anything that is not plainly https is refused rather than
## handed to HTTPRequest — a token is attacker-influenced data once an account is.
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


## Credits run to millions by design, so they are grouped or they are a wall of digits.
func test_balances_are_grouped() -> void:
	assert_str(Card._grouped(0)).is_equal("0")
	assert_str(Card._grouped(999)).is_equal("999")
	assert_str(Card._grouped(1000)).is_equal("1,000")
	assert_str(Card._grouped(1234567)).is_equal("1,234,567")
	assert_str(Card._grouped(-4200)).is_equal("-4,200")


## A balance that could not be read must not read as zero: that is a number a player
## would act on, and it is a different claim from "we could not ask".
func test_an_unread_balance_is_not_shown_as_zero() -> void:
	var card: AccountCard = Card.new()
	add_child(card)
	card.show_account("holy")
	card.show_wallet_error("session expired")
	assert_str(card.wallet_label.text).is_equal("session expired")
	assert_str(card.wallet_label.text).not_contains("0")
	card.queue_free()


## The title refreshes on every auth change and signing in emits more than once, so an
## unguarded second fetch hits HTTPRequest mid-flight and returns ERR_BUSY.
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


## A blank or non-https picture is not fetched at all, so it never occupies the slot and
## blocks the real one that arrives after it.
func test_a_url_that_is_not_https_is_never_fetched() -> void:
	var card := Card.new()
	add_child(card)
	auto_free(card)
	await await_idle_frame()
	assert_bool(card.load_avatar("")).is_false()
	assert_bool(card.load_avatar("http://example.invalid/a.png")).is_false()
	assert_bool(card.load_avatar("https://example.invalid/a.png")).is_true()


## Two accounts on one machine must not share a cache file, or the second one signs in
## wearing the first one's face until its own picture arrives.
func test_two_accounts_do_not_share_a_cache_file() -> void:
	var mine := Card.cache_path("https://cdn.example.invalid/me.png")
	var theirs := Card.cache_path("https://cdn.example.invalid/them.png")
	assert_str(mine).is_not_equal(theirs)
	assert_str(mine).starts_with(Card.AVATAR_DIR)
	assert_str(Card.cache_path("https://cdn.example.invalid/me.png")).is_equal(mine)


## The cached picture is drawn without asking the network, which is the whole point of
## keeping it: a returning player sees their face before any request is made.
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


## The account UUID identifies the account and is no use to the person reading it, so no
## part of the card may render it -- the title screen is the most likely thing on screen
## while streaming or being screenshotted.
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
