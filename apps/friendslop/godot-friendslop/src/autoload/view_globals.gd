extends Node

## Publishes the active camera's world position for shaders that must tell the
## color pass apart from a shadow pass.

## Far from any camera, so a scene without one reads as "not the color pass".
const NOWHERE := Vector3(0.0, -1000000.0, 0.0)


func _ready() -> void:
	process_priority = 1000
	_publish(NOWHERE)


func _process(_delta: float) -> void:
	_publish(camera_position())


## Where the shaders are told to look from, or [constant NOWHERE] with no camera.
func camera_position() -> Vector3:
	var viewport := get_viewport()
	var camera := viewport.get_camera_3d() if viewport else null
	return camera.global_position if camera else NOWHERE


func _publish(position: Vector3) -> void:
	RenderingServer.global_shader_parameter_set(&"view_position", position)
