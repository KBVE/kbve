extends TextureButton

@export var hover_scale: float = 1.1
@export var hover_duration: float = 0.2
@export var sfx_path: String = "res://scenes/ui/icons/anchor/anchor.ogg"

var original_scale: Vector2
var hover_tween: Tween

func _ready():
	original_scale = scale
	
	mouse_entered.connect(_on_mouse_entered)
	mouse_exited.connect(_on_mouse_exited)
	
	action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
	stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED

func _on_mouse_entered():
	var music_player = get_node_or_null("/root/MusicPlayerAutoload")
	if music_player and sfx_path != "":
		music_player.play_sfx_from_path(sfx_path)
	
	if hover_tween:
		hover_tween.kill()
	
	hover_tween = create_tween()
	hover_tween.tween_property(self, "scale", original_scale * hover_scale, hover_duration)
	hover_tween.set_ease(Tween.EASE_OUT)
	hover_tween.set_trans(Tween.TRANS_CUBIC)

func _on_mouse_exited():
	if hover_tween:
		hover_tween.kill()
	
	hover_tween = create_tween()
	hover_tween.tween_property(self, "scale", original_scale, hover_duration)
	hover_tween.set_ease(Tween.EASE_OUT)
	hover_tween.set_trans(Tween.TRANS_CUBIC)