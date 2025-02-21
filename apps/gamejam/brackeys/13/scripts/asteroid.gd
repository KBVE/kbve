class_name Asteroid extends Area2D

var movement_vector := Vector2(0, -1)
@onready var cshape = $CollisionShape2D
const WRAP_MARGIN := 30

func _ready() -> void:
	rotation = randf_range(0, 2*PI)

func _physics_process(delta):
	if not visible:
		return

	var speed = Global.get_environment_data("asteroid_speed")
	global_position += movement_vector.rotated(rotation) * speed * delta

	var radius = cshape.shape.radius
	var screen_size = get_viewport_rect().size

	if global_position.y + radius < -WRAP_MARGIN:
		global_position.y = screen_size.y + WRAP_MARGIN
	elif global_position.y - radius > screen_size.y + WRAP_MARGIN:
		global_position.y = -WRAP_MARGIN

	if global_position.x + radius < -WRAP_MARGIN:
		global_position.x = screen_size.x + WRAP_MARGIN
	elif global_position.x - radius > screen_size.x + WRAP_MARGIN:
		global_position.x = -WRAP_MARGIN

func destroy():
	visible = false
	print("Asteroid Destroyed")
	Global.emit_signal("entity_destroyed", "asteroid", get_instance_id(), {"position": global_position})
