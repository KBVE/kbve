extends GdUnitTestSuite


const AuthSessionScript = preload("res://src/autoload/auth_session.gd")


var _store_seq := 0


func _auth() -> Node:
	var node := Node.new()
	node.set_script(AuthSessionScript)
	_store_seq += 1
	node.store_path = "user://test_auth_session_%d_%d.cfg" % [_store_seq, Time.get_ticks_usec()]
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


func test_a_guest_carries_no_token_and_no_name() -> void:
	var auth := _auth()
	auth.sign_in_as_guest()
	assert_str(auth.access_token()).is_empty()
	assert_str(auth.requested_name()).is_empty()


func test_empty_credentials_never_reach_the_network() -> void:
	var auth := _auth()
	var code: int = await auth.sign_in("", "")
	assert_int(code).is_equal(ERR_INVALID_PARAMETER)
	assert_bool(auth.is_signed_in()).is_false()
	assert_str(auth.last_error()).is_not_empty()


func test_an_unknown_provider_opens_nothing() -> void:
	var auth := _auth()
	var code: int = await auth.sign_in_with_provider("myspace")
	assert_int(code).is_equal(ERR_INVALID_PARAMETER)
	assert_bool(auth.is_signed_in()).is_false()


func test_the_username_is_read_out_of_the_token() -> void:
	var token := _token({"kbve_username": "h0lybyte", "sub": "abc"})
	assert_str(AuthSessionScript.username_in(token)).is_equal("h0lybyte")


func test_a_token_without_the_claim_falls_back_to_user_metadata() -> void:
	var token := _token({"user_metadata": {"username": "fallback_guy"}})
	assert_str(AuthSessionScript.username_in(token)).is_equal("fallback_guy")


func test_an_unreadable_token_yields_no_name() -> void:
	assert_str(AuthSessionScript.username_in("")).is_empty()
	assert_str(AuthSessionScript.username_in("not-a-jwt")).is_empty()
	assert_str(AuthSessionScript.username_in("a.b.c")).is_empty()


func test_adopting_a_token_learns_the_name_from_it() -> void:
	var auth := _auth()
	auth.adopt_account(_token({"kbve_username": "claimed"}), "")
	assert_str(auth.requested_name()).is_equal("claimed")


func test_refresh_is_a_no_op_for_a_guest() -> void:
	var auth := _auth()
	auth.sign_in_as_guest()
	assert_int(await auth.refresh_if_stale()).is_equal(OK)
	assert_bool(auth.is_guest()).is_true()


func _token(claims: Dictionary) -> String:
	var payload := Marshalls.utf8_to_base64(JSON.stringify(claims))
	payload = payload.replace("+", "-").replace("/", "_").rstrip("=")
	return "header.%s.signature" % payload


func test_an_account_carries_its_token_and_name() -> void:
	var auth := _auth()
	auth.adopt_account("header.payload.signature", "h0lybyte")
	assert_int(auth.mode()).is_equal(AuthSessionScript.Mode.ACCOUNT)
	assert_str(auth.access_token()).is_equal("header.payload.signature")
	assert_str(auth.requested_name()).is_equal("h0lybyte")


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
