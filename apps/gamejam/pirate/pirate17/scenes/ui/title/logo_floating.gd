extends TextureRect

@export var float_distance: float = 10.0
@export var float_duration: float = 2.0
@export var rotate_angle_deg: float = 3.0
@export var rotate_duration: float = 3.0

var original_position: Vector2

func _ready():
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	original_position = position
	start_floating_animation()

func start_floating_animation():
	var tween := create_tween()
	tween.set_loops()
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_IN_OUT)
	tween.set_process_mode(Tween.TWEEN_PROCESS_IDLE)

	# Floating Y animation
	tween.tween_property(self, "position:y", original_position.y - float_distance, float_duration)
	tween.tween_property(self, "position:y", original_position.y, float_duration)

	# Rotation animation (optional)
	tween.parallel().tween_property(self, "rotation", deg_to_rad(-rotate_angle_deg), rotate_duration)
	tween.parallel().tween_property(self, "rotation", deg_to_rad(rotate_angle_deg), rotate_duration)
