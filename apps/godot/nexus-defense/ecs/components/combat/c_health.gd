class_name C_Health
extends Component

## Health component with reactive property changes for Observer pattern
## Emits property_changed signal when values change

@export var health: float = 100.0 : set = set_health
@export var max_health: float = 100.0 : set = set_max_health


func set_health(new_health: float) -> void:
	var old_health = health
	health = clampf(new_health, 0.0, max_health)
	property_changed.emit(self, "health", old_health, health)


func set_max_health(new_max: float) -> void:
	var old_max = max_health
	max_health = new_max
	if health > max_health:
		health = max_health
	property_changed.emit(self, "max_health", old_max, new_max)


func _init(_health: float = 100.0, _max_health: float = 100.0) -> void:
	max_health = _max_health
	health = _health
