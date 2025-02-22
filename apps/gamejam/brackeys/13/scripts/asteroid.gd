class_name Asteroid extends Area2D


var movement_vector := Vector2(0, -1)
@onready var cshape = $CollisionShape2D
@onready var explosion = $Explosion
@onready var sprite = $Sprite2D

const WRAP_MARGIN := 30

func _ready() -> void:
	rotation = randf_range(0, 2*PI)
	explosion.animation_finished.connect(_cleanup)


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
	sprite.visible = false
	explosion.play("explode")
	

	
func _cleanup():
	if explosion.animation == "default":
		print("Default Animation is Playing")
		pass
	if explosion.animation == "explode":
		sprite.visible = true
		explosion.stop()
		visible = false
		Global.emit_signal("entity_destroyed", "asteroid", get_instance_id(), {"position": global_position})
		print("Asteroid Destroyed")


func _on_body_entered(body):
	if body is Spaceship:
		var starship = body
		starship.activate_shield()
