extends GdUnitTestSuite


const AuthSessionScript = preload("res://src/autoload/auth_session.gd")

const RFC_VERIFIER := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC_CHALLENGE := "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


func test_the_challenge_matches_the_specs_worked_example() -> void:
	assert_str(OAuthLoopback.challenge_for(RFC_VERIFIER)).is_equal(RFC_CHALLENGE)


func test_a_verifier_is_the_right_shape() -> void:
	var verifier := OAuthLoopback.new_verifier()
	assert_int(verifier.length()).is_equal(43)
	assert_bool(verifier.contains("=")).is_false()
	assert_bool(verifier.contains("+") or verifier.contains("/")).is_false()


func test_verifiers_do_not_repeat() -> void:
	var seen := {}
	for i in 32:
		seen[OAuthLoopback.new_verifier()] = true
	assert_int(seen.size()).is_equal(32)


func test_the_authorize_url_carries_the_challenge_and_the_port() -> void:
	var url := AuthSessionScript.authorize_url("discord", 47119, RFC_VERIFIER)
	assert_str(url).starts_with("https://supabase.kbve.com/auth/v1/authorize?")
	assert_str(url).contains("provider=discord")
	assert_str(url).contains("code_challenge=%s" % RFC_CHALLENGE)
	assert_str(url).contains("code_challenge_method=s256")
	assert_str(url).contains("redirect_to=http%3A%2F%2F127.0.0.1%3A47119%2Fcallback")


func test_the_authorize_url_never_carries_the_verifier() -> void:
	var url := AuthSessionScript.authorize_url("discord", 47119, RFC_VERIFIER)
	assert_bool(url.contains(RFC_VERIFIER)).is_false()


func test_a_redirect_with_a_code_is_read() -> void:
	var answer := OAuthLoopback.parse_request(
		"GET /callback?code=abc123&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
	)
	assert_str(answer.get("code", "")).is_equal("abc123")


func test_a_refusal_is_reported_in_the_providers_words() -> void:
	var answer := OAuthLoopback.parse_request(
		"GET /callback?error=access_denied&error_description=The+user+denied+access HTTP/1.1\r\n\r\n"
	)
	assert_bool(answer.has("code")).is_false()
	assert_str(answer.get("error", "")).is_equal("The user denied access")


func test_anything_else_on_the_port_is_an_error_not_a_code() -> void:
	for request in [
		"",
		"GET / HTTP/1.1\r\n\r\n",
		"GET /callback HTTP/1.1\r\n\r\n",
		"nonsense",
		"GET /callback?state=only HTTP/1.1\r\n\r\n",
	]:
		var answer := OAuthLoopback.parse_request(request)
		assert_bool(answer.has("code")).override_failure_message(
			"accepted a code from: %s" % request
		).is_false()
		assert_str(answer.get("error", "")).is_not_empty()


func test_percent_encoding_survives_the_parse() -> void:
	var answer := OAuthLoopback.parse_request("GET /callback?code=a%2Fb%3Dc HTTP/1.1\r\n\r\n")
	assert_str(answer.get("code", "")).is_equal("a/b=c")


func test_it_listens_on_localhost_and_gives_the_port_back() -> void:
	var loopback := OAuthLoopback.new()
	add_child(loopback)
	auto_free(loopback)
	var port := loopback.listen()
	assert_int(port).is_greater(0)

	var probe := StreamPeerTCP.new()
	assert_int(probe.connect_to_host("127.0.0.1", port)).is_equal(OK)
	loopback.close()
	probe.disconnect_from_host()


func test_closing_twice_is_harmless() -> void:
	var loopback := OAuthLoopback.new()
	add_child(loopback)
	auto_free(loopback)
	loopback.listen()
	loopback.close()
	loopback.close()
