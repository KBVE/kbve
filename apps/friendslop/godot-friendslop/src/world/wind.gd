extends Node

@export_range(-180.0, 180.0, 1.0) var direction_deg := 72.0
@export var strength := 1.0
@export_range(0.0, 1.0, 0.01) var gustiness := 0.25
@export var gust_period_sec := 7.0
@export var grass_wind_scale := 0.55
@export var cloud_speed_scale := 2.0

@export var grass_material: ShaderMaterial
@export var environment_node: WorldEnvironment

var _sky_material: ShaderMaterial
var _time := 0.0


func _ready() -> void:
	if environment_node and environment_node.environment.sky:
		_sky_material = environment_node.environment.sky.sky_material as ShaderMaterial
	set_wind(direction_deg, strength)


func set_wind(new_direction_deg: float, new_strength: float) -> void:
	direction_deg = new_direction_deg
	strength = new_strength
	if _sky_material:
		_sky_material.set_shader_parameter("clouds_direction", wrapf(deg_to_rad(direction_deg) / TAU, -0.5, 0.5))
		_sky_material.set_shader_parameter("clouds_speed", strength * cloud_speed_scale)
	Game.events.notify(EventNames.WIND_CHANGED, {"direction_deg": direction_deg, "strength": strength})


func _process(delta: float) -> void:
	if not grass_material:
		return
	_time += delta
	var gust := 1.0 + gustiness * (
		sin(_time * TAU / gust_period_sec) * 0.6
		+ sin(_time * TAU / (gust_period_sec * 0.37) + 1.3) * 0.4
	)
	var rad := deg_to_rad(direction_deg)
	var v := Vector2(sin(rad), cos(rad)) * strength * grass_wind_scale * gust
	grass_material.set_shader_parameter("wind_velocity", v)
