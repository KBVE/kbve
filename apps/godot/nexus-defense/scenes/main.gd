extends Node2D

const SERVER_URL := "ws://127.0.0.1:7878/ws"

@onready var title_label: Label = $UI/Title
@onready var status_label: Label = $UI/Status

var socket: MatchSocket
var status_lines: Array[String] = []

func _ready() -> void:
	title_label.text = "Nexus Defense"
	_append("Godot %s · gecs + q" % Engine.get_version_info()["string"])

	var ping := NdPing.new()
	_append("ping: %s · 2+3=%d" % [ping.pong(), ping.add(2, 3)])
	ping.queue_free()

	socket = MatchSocket.new()
	add_child(socket)
	socket.connected.connect(_on_connected)
	socket.welcome.connect(_on_welcome)
	socket.snapshot.connect(_on_snapshot)
	socket.disconnected.connect(_on_disconnected)
	socket.decode_error.connect(_on_decode_error)
	_append("dialing %s" % SERVER_URL)
	socket.connect_to(SERVER_URL)

func _on_connected() -> void:
	_append("ws connected")

func _on_welcome(slot: int, seed: int) -> void:
	_append("welcome: slot=%d seed=0x%x" % [slot, seed])

func _on_snapshot(tick: int) -> void:
	_append("snapshot tick=%d" % tick)

func _on_disconnected(reason: String) -> void:
	_append("disconnected: %s" % reason)

func _on_decode_error(detail: String) -> void:
	_append("decode error: %s" % detail)

func _append(line: String) -> void:
	status_lines.append(line)
	if status_lines.size() > 6:
		status_lines = status_lines.slice(status_lines.size() - 6)
	status_label.text = "\n".join(status_lines)
	print("[nexus-defense] %s" % line)
