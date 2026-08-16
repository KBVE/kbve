extends GdUnitTestSuite

## Guards the handle prompt a brand-new account is shown.

const NamePanel := preload("res://src/ui/username_panel.gd")
const Auth := preload("res://src/autoload/auth_session.gd")


func _token(claims: Dictionary) -> String:
	var payload := Marshalls.utf8_to_base64(JSON.stringify(claims))
	payload = payload.replace("+", "-").replace("/", "_").rstrip("=")
	return "header." + payload + ".signature"


## The same rule the web and mobile clients enforce. Two spellings of it would let a name
## through here that the API refuses, which the player reads as the game being broken
## rather than the name being wrong.
func test_the_rule_matches_the_other_clients() -> void:
	for good in ["abc", "holy", "a_b_c", "user123", "a23456789012345678901234"]:
		assert_bool(NamePanel.is_valid(good)) \
			.override_failure_message("'%s' should be allowed" % good).is_true()
	for bad in ["", "ab", "1abc", "_abc", "has space", "has-dash", "a234567890123456789012345",
			"héllo", "abc!"]:
		assert_bool(NamePanel.is_valid(bad)) \
			.override_failure_message("'%s' should be refused" % bad).is_false()


## Supabase makes the account the moment a provider vouches for someone; the handle is a
## separate claim nothing has written yet. That gap is the whole reason for the prompt.
func test_a_fresh_account_is_asked_for_a_handle() -> void:
	var auth: Node = Auth.new()
	add_child(auth)
	auth.adopt_account(_token({"sub": "abc"}), "", "refresh", 0)
	assert_bool(auth.needs_username()) \
		.override_failure_message("a nameless account was not asked to pick one").is_true()

	auth.adopt_account(_token({"sub": "abc", "kbve_username": "holy"}), "", "refresh", 0)
	assert_bool(auth.needs_username()) \
		.override_failure_message("an account with a handle was asked to pick another").is_false()
	auth.sign_out()
	auth.queue_free()


## A guest has no account to name.
func test_a_guest_is_never_asked() -> void:
	var auth: Node = Auth.new()
	add_child(auth)
	auth.sign_in_as_guest()
	assert_bool(auth.needs_username()).is_false()
	auth.sign_out()
	assert_bool(auth.needs_username()).is_false()
	auth.queue_free()


## Sent lowercased, the way the other clients send it, so one person cannot end up with
## two spellings of a handle depending on which client they signed up from.
func test_the_handle_is_sent_lowercased() -> void:
	var panel: UsernamePanel = NamePanel.new()
	add_child(panel)
	panel.field.text = "  HolyByte  "
	assert_str(panel.typed()).is_equal("holybyte")
	panel.queue_free()


## Nothing may be sent that cannot possibly be accepted.
func test_the_button_refuses_an_impossible_name() -> void:
	var panel: UsernamePanel = NamePanel.new()
	add_child(panel)
	panel.field.text = "ab"
	panel._on_typed("ab")
	assert_bool(panel.submit_button.disabled) \
		.override_failure_message("a two-character name could be submitted").is_true()
	panel.field.text = "abc"
	panel._on_typed("abc")
	assert_bool(panel.submit_button.disabled).is_false()
	panel.queue_free()


## The name is taken by whoever asks first, so a second press would race the answer to
## the first.
func test_a_claim_in_flight_locks_the_panel() -> void:
	var panel: UsernamePanel = NamePanel.new()
	add_child(panel)
	panel.field.text = "holy"
	panel._on_typed("holy")
	panel.set_busy(true)
	assert_bool(panel.submit_button.disabled).is_true()
	assert_bool(panel.field.editable).is_false()
	panel.queue_free()
