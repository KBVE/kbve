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
	card.show_account("holy", "abc")
	card.show_wallet_error("session expired")
	assert_str(card.wallet_label.text).is_equal("session expired")
	assert_str(card.wallet_label.text).not_contains("0")
	card.queue_free()
