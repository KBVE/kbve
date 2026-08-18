extends GdUnitTestSuite


const Probe := preload("res://src/net/server_probe.gd")


func test_the_health_url_follows_the_socket_it_belongs_to() -> void:
	assert_str(Probe.health_url("wss://friendslop.kbve.com/ws")) \
		.is_equal("https://friendslop.kbve.com/healthz")
	assert_str(Probe.health_url("ws://127.0.0.1:7980/ws")) \
		.is_equal("http://127.0.0.1:7980/healthz")


func test_a_hand_typed_url_still_resolves() -> void:
	assert_str(Probe.health_url("  ws://127.0.0.1:7980/ws  ")) \
		.is_equal("http://127.0.0.1:7980/healthz")
	assert_str(Probe.health_url("ws://127.0.0.1:7980")) \
		.is_equal("http://127.0.0.1:7980/healthz")


func test_the_port_is_not_lost() -> void:
	assert_str(Probe.health_url("wss://example.com:8443/ws")) \
		.is_equal("https://example.com:8443/healthz")


func test_the_client_knows_its_own_protocol() -> void:
	assert_int(BuildInfo.protocol()).is_greater(0)


func _body(text: String) -> PackedByteArray:
	return text.to_utf8_buffer()


func test_a_health_payload_with_a_protocol_is_read() -> void:
	assert_int(Probe.read_health(HTTPRequest.RESULT_SUCCESS, 200,
			_body('{"status":"ok","protocol":10}'))).is_equal(10)


func test_an_answer_without_a_protocol_is_not_called_unreachable() -> void:
	for said in ["ok", "", "{}", '{"status":"ok"}', "<html>up</html>"]:
		assert_int(Probe.read_health(HTTPRequest.RESULT_SUCCESS, 200, _body(said))) \
			.override_failure_message("'%s' should read as unreadable, not as no answer" % said) \
			.is_equal(Probe.UNREADABLE)


func test_a_zero_protocol_is_not_quoted() -> void:
	assert_int(Probe.read_health(HTTPRequest.RESULT_SUCCESS, 200, _body('{"protocol":0}'))) \
		.is_equal(Probe.UNREADABLE)


func test_nothing_answering_is_still_unreachable() -> void:
	assert_int(Probe.read_health(HTTPRequest.RESULT_CANT_CONNECT, 0, _body(""))) \
		.is_equal(Probe.NO_ANSWER)
	assert_int(Probe.read_health(HTTPRequest.RESULT_SUCCESS, 502, _body("bad gateway"))) \
		.is_equal(Probe.NO_ANSWER)
	assert_int(Probe.read_health(HTTPRequest.RESULT_SUCCESS, 404, _body('{"protocol":10}'))) \
		.override_failure_message("a protocol read off a 404 body was trusted") \
		.is_equal(Probe.NO_ANSWER)


func test_the_failure_values_cannot_be_mistaken_for_a_protocol() -> void:
	assert_int(Probe.NO_ANSWER).is_less(0)
	assert_int(Probe.UNREADABLE).is_less(0)
	assert_bool(Probe.NO_ANSWER == Probe.UNREADABLE) \
		.override_failure_message("no-answer and unreadable collapsed into one value").is_false()


func test_an_unstamped_build_does_not_invent_a_version() -> void:
	var stamped: String = str(ProjectSettings.get_setting("application/config/version", ""))
	if stamped == "":
		assert_str(BuildInfo.version()).is_equal(BuildInfo.UNSTAMPED)
	else:
		assert_str(BuildInfo.version()).is_equal(stamped)
