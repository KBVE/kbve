extends SceneTree


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
