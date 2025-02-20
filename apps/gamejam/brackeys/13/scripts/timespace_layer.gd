extends Node2D

@onready var color_rect := $ColorRect


func _ready() -> void:
	color_rect.color = Color(0,0,0)
	update_background_size()
	get_viewport().connect("size_changed", Callable(self, "_on_viewport_resized"))


func update_background_size():
	color_rect.size = get_viewport_rect().size

func _on_viewport_resized():
	update_background_size()

func _process(delta: float) -> void:
	pass
