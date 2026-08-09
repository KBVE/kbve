class_name NetSync
extends Node

const DEFAULT_PORT := 7777

@export var tick_rate := 10.0

var factory: ObjectFactory

var _accum := 0.0


func host(port: int = DEFAULT_PORT, max_clients: int = 8) -> Error:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, max_clients)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	return OK


func join(address: String, port: int = DEFAULT_PORT) -> Error:
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	return OK


func stop() -> void:
	multiplayer.multiplayer_peer = null


func _physics_process(delta: float) -> void:
	if multiplayer.multiplayer_peer == null or not multiplayer.is_server():
		return
	if multiplayer.get_peers().is_empty():
		return
	_accum += delta
	if _accum < 1.0 / tick_rate:
		return
	_accum = 0.0
	_receive_snapshot.rpc(var_to_bytes(_packer().pack().data()))


@rpc("authority", "call_remote", "unreliable_ordered")
func _receive_snapshot(bytes: PackedByteArray) -> void:
	var dict: Variant = bytes_to_var(bytes)
	if dict is Dictionary:
		_packer().unpack(DataPack.new(dict))


func _packer() -> ECSWorldPacker:
	var p := ECSWorldPacker.new(Game.world)
	if factory:
		p.with_factory(factory)
	return p
