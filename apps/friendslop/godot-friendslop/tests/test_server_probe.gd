extends GdUnitTestSuite

## Guards the health probe the title screen asks before anyone presses play.

const Probe := preload("res://src/net/server_probe.gd")


## The health endpoint has to land on the same host and the same scheme family as the
## socket. Reaching a `wss://` host over plain http is a request a browser-grade TLS
## policy drops and a deployed gateway redirects, either of which reads to the player as
## "server unreachable" against a server that is perfectly fine.
func test_the_health_url_follows_the_socket_it_belongs_to() -> void:
	assert_str(Probe.health_url("wss://friendslop.kbve.com/ws")) \
		.is_equal("https://friendslop.kbve.com/healthz")
	assert_str(Probe.health_url("ws://127.0.0.1:7980/ws")) \
		.is_equal("http://127.0.0.1:7980/healthz")


## FS_URL is set by hand when testing a local server, so it arrives in whatever shape
## somebody typed.
func test_a_hand_typed_url_still_resolves() -> void:
	assert_str(Probe.health_url("  ws://127.0.0.1:7980/ws  ")) \
		.is_equal("http://127.0.0.1:7980/healthz")
	assert_str(Probe.health_url("ws://127.0.0.1:7980")) \
		.is_equal("http://127.0.0.1:7980/healthz")


## The port is part of the host and must survive.
func test_the_port_is_not_lost() -> void:
	assert_str(Probe.health_url("wss://example.com:8443/ws")) \
		.is_equal("https://example.com:8443/healthz")


## The whole point of the probe: this build knows its own wire version offline, so a
## mismatch can be shown before a socket is ever opened.
func test_the_client_knows_its_own_protocol() -> void:
	assert_int(BuildInfo.protocol()).is_greater(0)


func _body(text: String) -> PackedByteArray:
	return text.to_utf8_buffer()


func test_a_health_payload_with_a_protocol_is_read() -> void:
	assert_int(Probe.read_health(HTTPRequest.RESULT_SUCCESS, 200,
			_body('{"status":"ok","protocol":10}'))).is_equal(10)


## The live server answered a bare `ok` for as long as it ran a build older than the
## health payload, and that was reported to the player as "server unreachable" against a
## server that was up, on the right protocol, and joinable. Answering badly and not
## answering are different things and must not collapse into one another.
func test_an_answer_without_a_protocol_is_not_called_unreachable() -> void:
	for said in ["ok", "", "{}", '{"status":"ok"}', "<html>up</html>"]:
		assert_int(Probe.read_health(HTTPRequest.RESULT_SUCCESS, 200, _body(said))) \
			.override_failure_message("'%s' should read as unreadable, not as no answer" % said) \
			.is_equal(Probe.UNREADABLE)


## A protocol of zero is what an absent field decodes to, so quoting it would put "server
## protocol 0" on the title.
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


## The two outcomes have to stay distinguishable from a real protocol and from each other,
## since the title tells them apart by value alone.
func test_the_failure_values_cannot_be_mistaken_for_a_protocol() -> void:
	assert_int(Probe.NO_ANSWER).is_less(0)
	assert_int(Probe.UNREADABLE).is_less(0)
	assert_bool(Probe.NO_ANSWER == Probe.UNREADABLE) \
		.override_failure_message("no-answer and unreadable collapsed into one value").is_false()


## An unstamped build must say so rather than quote a number. Every editor run and every
## local export is unstamped, and a stale version shown confidently is the one a player
## would quote back in a bug report.
func test_an_unstamped_build_does_not_invent_a_version() -> void:
	var stamped: String = str(ProjectSettings.get_setting("application/config/version", ""))
	if stamped == "":
		assert_str(BuildInfo.version()).is_equal(BuildInfo.UNSTAMPED)
	else:
		assert_str(BuildInfo.version()).is_equal(stamped)
