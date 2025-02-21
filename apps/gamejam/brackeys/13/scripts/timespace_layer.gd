extends Node2D

@onready var color_rect := $ColorRect
@onready var background_sprite := $BackgroundSprite

func _ready() -> void:
	color_rect.color = Color(0,0,0)
	background_sprite.centered = false
	update_background_size()
	get_viewport().connect("size_changed", Callable(self, "_on_viewport_resized"))

func update_background_size():
	var viewport_size: Vector2 = get_viewport().get_visible_rect().size
	
	if background_sprite and background_sprite.texture:
		var texture_size: Vector2 = background_sprite.texture.get_size()
		var scale_x: float = viewport_size.x / texture_size.x
		var scale_y: float = viewport_size.y / texture_size.y
		background_sprite.scale = Vector2(scale_x, scale_y)
		background_sprite.position = Vector2.ZERO

	color_rect.size = viewport_size

func _on_viewport_resized():
	update_background_size()
