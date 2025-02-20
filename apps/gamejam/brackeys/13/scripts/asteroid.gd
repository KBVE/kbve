class_name Asteroid extends Area2D

var movement_vector := Vector2(0, -1)
@onready var cshape = $CollisionShape2D

func _ready() -> void:
	rotation = randf_range(0, 2*PI)
	

func _physics_process(delta):
	var speed = Global.get_environment_data("asteroid_speed")
	global_position += movement_vector.rotated(rotation) * speed * delta
	
	var radius = cshape.shape.radius
	var screen_size = get_viewport_rect().size
	if (global_position.y+radius) < 0:
		global_position.y = (screen_size.y+radius)
	elif (global_position.y-radius) > screen_size.y:
		global_position.y = -radius
	if (global_position.x+radius) < 0:
		global_position.x = (screen_size.x+radius)
	elif (global_position.x-radius) > screen_size.x:
		global_position.x = -radius


func destroy():
	visible = false
	get_parent()._on_asteroid_destroyed(self)
