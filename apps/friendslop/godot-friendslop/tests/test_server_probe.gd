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


## An unstamped build must say so rather than quote a number. Every editor run and every
## local export is unstamped, and a stale version shown confidently is the one a player
## would quote back in a bug report.
func test_an_unstamped_build_does_not_invent_a_version() -> void:
	var stamped: String = str(ProjectSettings.get_setting("application/config/version", ""))
	if stamped == "":
		assert_str(BuildInfo.version()).is_equal(BuildInfo.UNSTAMPED)
	else:
		assert_str(BuildInfo.version()).is_equal(stamped)
