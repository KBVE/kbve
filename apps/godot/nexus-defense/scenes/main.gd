extends Node2D

@onready var title_label: Label = $UI/Title
@onready var status_label: Label = $UI/Status

func _ready() -> void:
	title_label.text = "Nexus Defense"
	var ping := NdPing.new()
	var msg: String = ping.pong()
	var sum: int = ping.add(2, 3)
	ping.queue_free()
	status_label.text = "Godot %s · gecs + nd-native · %s · 2+3=%d" % [
		Engine.get_version_info()["string"],
		msg,
		sum,
	]
	print("[nexus-defense] main scene ready — nd-native pong: %s" % msg)
