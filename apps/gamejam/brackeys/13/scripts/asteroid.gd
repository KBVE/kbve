class_name Asteroid extends Area2D


var movement_vector := Vector2(0, -1)
@onready var cshape = $CollisionShape2D
@onready var explosion = $Explosion
@onready var sprite = $Sprite2D

const MAX_DISTANCE := 1000 
var spaceship: Node2D = null
# const WRAP_MARGIN := 30

func _ready() -> void:
	rotation = randf_range(0, 2*PI)
	explosion.animation_finished.connect(_cleanup)
	_get_spaceship_reference()


func _physics_process(delta):
	if not visible or not spaceship:
		return

	var speed = Global.get_environment_data("asteroid_speed")
	global_position += movement_vector.rotated(rotation) * speed * delta

	if global_position.distance_to(spaceship.global_position) > MAX_DISTANCE:
		reset_to_pool()

func destroy():
	sprite.visible = false
	explosion.play("explode")
	
func reset_to_pool():
	visible = false
	if spaceship:
		global_position = spaceship.global_position + Vector2(-10000, -10000)
	else:
		global_position = Vector2(-10000, -10000)  
	# Global.emit_signal("asteroid_recycled", self)
	
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
		var _starship = body
		_starship.activate_shield()

func _get_spaceship_reference():
	spaceship = get_tree().get_root().find_child("Spaceship", true, false)
	if not spaceship:
		print("Warning: Spaceship not found in the scene!")
