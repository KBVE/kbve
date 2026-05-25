extends GdUnitTestSuite

const TdServerFixture := preload("res://tests/helpers/td_server_fixture.gd")

var _fixture: TdServerFixture
var _socket: Node

func before_test() -> void:
	_fixture = TdServerFixture.new()

func after_test() -> void:
	if _socket and is_instance_valid(_socket):
		_socket.queue_free()
	if _fixture:
		_fixture.stop()
	await get_tree().create_timer(0.2).timeout

func _require_match_socket_and_binary() -> bool:
	if not ClassDB.class_exists("MatchSocket"):
		return false
	if TdServerFixture.find_binary() == "":
		return false
	return true

func test_fixture_starts_and_client_connects() -> void:
	if not _require_match_socket_and_binary():
		return
	var started: bool = await _fixture.start()
	assert_bool(started).is_true()
	_socket = ClassDB.instantiate("MatchSocket")
	add_child(_socket)
	var monitor: Variant = monitor_signals(_socket, false)
	_socket.call("connect_to", _fixture.addr, "dev", "tester")
	await assert_signal(monitor).wait_until(5000).is_emitted("connected")
	assert_bool(bool(_socket.call("is_connected"))).is_true()

func test_send_heartbeat_does_not_disconnect() -> void:
	if not _require_match_socket_and_binary():
		return
	var started: bool = await _fixture.start()
	assert_bool(started).is_true()
	_socket = ClassDB.instantiate("MatchSocket")
	add_child(_socket)
	var monitor: Variant = monitor_signals(_socket, false)
	_socket.call("connect_to", _fixture.addr, "dev", "tester")
	await assert_signal(monitor).wait_until(5000).is_emitted("connected")
	_socket.call("send_heartbeat", 42)
	await get_tree().create_timer(0.5).timeout
	assert_bool(bool(_socket.call("is_connected"))).is_true()

func test_disconnects_cleanly_when_socket_freed() -> void:
	if not _require_match_socket_and_binary():
		return
	var started: bool = await _fixture.start()
	assert_bool(started).is_true()
	_socket = ClassDB.instantiate("MatchSocket")
	add_child(_socket)
	var monitor: Variant = monitor_signals(_socket, false)
	_socket.call("connect_to", _fixture.addr, "dev", "tester")
	await assert_signal(monitor).wait_until(5000).is_emitted("connected")
	_socket.queue_free()
	_socket = null
	await get_tree().create_timer(0.4).timeout
