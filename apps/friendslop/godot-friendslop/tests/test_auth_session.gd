extends GdUnitTestSuite

## Covers the identity the title screen hands the game. The Supabase half is
## deliberately unimplemented, so what is pinned here is that it *says so*
## rather than quietly reporting success.

const AuthSessionScript = preload("res://src/autoload/auth_session.gd")


func _auth() -> Node:
	var node := Node.new()
	node.set_script(AuthSessionScript)
	add_child(node)
	auto_free(node)
	return node


func test_starts_signed_out() -> void:
	var auth := _auth()
	assert_bool(auth.is_signed_in()).is_false()
	assert_bool(auth.is_guest()).is_false()
	assert_int(auth.mode()).is_equal(AuthSessionScript.Mode.SIGNED_OUT)


func test_guest_sign_in_needs_no_credentials() -> void:
	var auth := _auth()
	auth.sign_in_as_guest()
	assert_bool(auth.is_guest()).is_true()
	assert_bool(auth.is_signed_in()).is_true()


## A guest asks the server for nothing and carries no token; the server is what
## names them.
func test_a_guest_carries_no_token_and_no_name() -> void:
	var auth := _auth()
	auth.sign_in_as_guest()
	assert_str(auth.access_token()).is_empty()
	assert_str(auth.requested_name()).is_empty()


func test_supabase_login_reports_that_it_is_unwired() -> void:
	var auth := _auth()
	assert_int(auth.sign_in("someone@kbve.com", "hunter2")).is_equal(ERR_UNAVAILABLE)
	assert_bool(auth.is_signed_in()).is_false()


func test_an_account_carries_its_token_and_name() -> void:
	var auth := _auth()
	auth.adopt_account("header.payload.signature", "h0lybyte")
	assert_int(auth.mode()).is_equal(AuthSessionScript.Mode.ACCOUNT)
	assert_str(auth.access_token()).is_equal("header.payload.signature")
	assert_str(auth.requested_name()).is_equal("h0lybyte")


## An empty token would look signed-in to every caller while authenticating as
## nobody, which is worse than staying signed out.
func test_an_empty_token_is_refused() -> void:
	var auth := _auth()
	auth.adopt_account("", "h0lybyte")
	assert_bool(auth.is_signed_in()).is_false()


func test_sign_out_clears_everything() -> void:
	var auth := _auth()
	auth.adopt_account("token", "h0lybyte")
	auth.sign_out()
	assert_bool(auth.is_signed_in()).is_false()
	assert_str(auth.access_token()).is_empty()
	assert_str(auth.requested_name()).is_empty()


func test_every_transition_announces_itself() -> void:
	var auth := _auth()
	var seen := [0]
	auth.changed.connect(func() -> void: seen[0] += 1)
	auth.sign_in_as_guest()
	auth.sign_out()
	assert_int(seen[0]).is_equal(2)
