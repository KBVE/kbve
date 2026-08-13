extends SceneTree

## Manual end-to-end check against a running friendslop-server. Not a gdUnit
## suite — it needs a live server, so `nx test` skips it.
##
## Defaults to the deployed fleet; point FS_URL at a local server to check one:
##
##   godot --headless -s tests/live_net.gd
##   FS_URL=ws://127.0.0.1:7980/ws godot --headless -s tests/live_net.gd
##
## No name is requested, so the server answers with an Anon-XXXX one — that is
## the whole of guest mode, and it is what LIVE OK prints back.

const DEPLOYED_URL := "wss://friendslop.kbve.com/ws"

var _client: NetGameClient
var _frames := 0

func _initialize() -> void:
	var url := OS.get_environment("FS_URL")
	_client = NetGameClient.new()
	_client.server_url = url if url != "" else DEPLOYED_URL
	get_root().add_child(_client)
	_client.connect_to_server()

func _process(_delta: float) -> bool:
	_frames += 1
	if _client.is_joined() and _client.snapshot_tick() > 0 and _client.local_avatar() != null:
		var a := _client.local_avatar()
		print("LIVE OK joined as=%s seed=%d body=%d tick=%d avatar=%s pos=%s roster=%s" % [
			_client.local_name(), _client.world_seed(), _client.local_body(),
			_client.snapshot_tick(), a.name, str(a.global_position),
			str(_client.roster())])
		return true
	if _frames > 600:
		print("LIVE TIMEOUT joined=%s err=%s" % [_client.is_joined(), _client.last_error()])
		return true
	return false
