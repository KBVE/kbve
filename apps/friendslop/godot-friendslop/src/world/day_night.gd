extends Node3D

@export var day_length_minutes := 10.0
@export var start_hour := 9.0

var hour: float

var _last_hour := -1

@onready var sun: DirectionalLight3D = $Sun
@onready var moon: DirectionalLight3D = $Moon


func _ready() -> void:
	hour = start_hour
	_update_lights()


func _process(delta: float) -> void:
	hour = fmod(hour + delta * 24.0 / (day_length_minutes * 60.0), 24.0)
	_update_lights()
	var h := int(hour)
	if h != _last_hour:
		_last_hour = h
		Game.events.notify(EventNames.HOUR_CHANGED, h)


func _update_lights() -> void:
	var angle := (hour - 6.0) * TAU / 24.0
	sun.rotation = Vector3(-angle, 0.0, 0.0)
	moon.rotation = Vector3(-angle + PI, 0.0, 0.0)
	sun.light_energy = clampf(-(-sun.global_basis.z).y * 3.0, 0.0, 1.0)
	moon.light_energy = clampf(-(-moon.global_basis.z).y * 3.0, 0.0, 0.35)
