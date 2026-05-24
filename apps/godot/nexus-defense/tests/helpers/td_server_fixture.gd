class_name TdServerFixture
extends RefCounted

var pid: int = -1
var addr: String = ""
var host: String = "127.0.0.1"
var port: int = 0

static func find_binary() -> String:
	var explicit := OS.get_environment("TD_SERVER_BIN")
	if explicit != "" and FileAccess.file_exists(explicit):
		return explicit
	var candidates := [
		"../../../dist/target/release/td-server",
		"../../../dist/target/debug/td-server",
		"../../../target/release/td-server",
		"../../../target/debug/td-server",
		"../../target/release/td-server",
		"../../target/debug/td-server",
	]
	var project_dir := ProjectSettings.globalize_path("res://")
	for rel in candidates:
		var p: String = project_dir.path_join(rel).simplify_path()
		if FileAccess.file_exists(p):
			return p
	return ""

static func find_free_port() -> int:
	var server := TCPServer.new()
	for candidate in range(45000, 46000):
		if server.listen(candidate, "127.0.0.1") == OK:
			server.stop()
			return candidate
	return 0

func start() -> bool:
	var bin := find_binary()
	if bin == "":
		return false
	port = find_free_port()
	if port == 0:
		return false
	addr = "ws://%s:%d/ws" % [host, port]
	var env_addr := "%s:%d" % [host, port]
	OS.set_environment("TD_SERVER_ADDR", env_addr)
	pid = OS.create_process(bin, [], false)
	if pid <= 0:
		return false
	return await _wait_for_port(5.0)

func _wait_for_port(timeout_seconds: float) -> bool:
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000)
	while Time.get_ticks_msec() < deadline:
		var stream := StreamPeerTCP.new()
		if stream.connect_to_host(host, port) == OK:
			for _i in 30:
				stream.poll()
				var status := stream.get_status()
				if status == StreamPeerTCP.STATUS_CONNECTED:
					stream.disconnect_from_host()
					return true
				if status == StreamPeerTCP.STATUS_ERROR or status == StreamPeerTCP.STATUS_NONE:
					break
				await Engine.get_main_loop().create_timer(0.02).timeout
			stream.disconnect_from_host()
		await Engine.get_main_loop().create_timer(0.05).timeout
	return false

func stop() -> void:
	if pid > 0:
		OS.kill(pid)
		pid = -1
