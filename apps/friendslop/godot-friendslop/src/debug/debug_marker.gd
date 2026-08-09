extends Node3D

var player: Node3D

@onready var _label: Label3D = $Label


func _process(_delta: float) -> void:
	if player:
		_label.text = "%.1f m" % global_position.distance_to(player.global_position)
