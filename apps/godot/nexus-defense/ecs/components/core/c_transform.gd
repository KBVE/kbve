class_name C_Transform
extends Component

## Stores position and rotation, synced with a CharacterBody3D node
## Used by systems to query entity world position without scene tree traversal

@export var position: Vector3 = Vector3.ZERO : set = set_position
@export var rotation: Vector3 = Vector3.ZERO : set = set_rotation


func set_position(new_pos: Vector3) -> void:
	var old_pos = position
	position = new_pos
	property_changed.emit(self, "position", old_pos, new_pos)


func set_rotation(new_rot: Vector3) -> void:
	var old_rot = rotation
	rotation = new_rot
	property_changed.emit(self, "rotation", old_rot, new_rot)


func _init(_position: Vector3 = Vector3.ZERO, _rotation: Vector3 = Vector3.ZERO) -> void:
	position = _position
	rotation = _rotation
