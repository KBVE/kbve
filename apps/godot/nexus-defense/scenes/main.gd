extends Node2D

@onready var title_label: Label = $UI/Title
@onready var status_label: Label = $UI/Status

func _ready() -> void:
	title_label.text = "Nexus Defense"
	status_label.text = "Bootstrap OK · Godot %s · gecs loaded" % Engine.get_version_info()["string"]
	print("[nexus-defense] main scene ready")
