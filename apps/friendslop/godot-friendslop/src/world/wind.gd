extends Node

@export_range(-180.0, 180.0, 1.0) var direction_deg := 72.0
@export var strength := 1.0
@export var grass_wind_strength := 0.15
@export var ground_wind_strength := 0.1
@export var cloud_speed_scale := 4.0

@export var grass_material: ShaderMaterial
@export var ground_material: ShaderMaterial
@export var environment_node: WorldEnvironment

var _sky_material: ShaderMaterial


func _ready() -> void:
	if environment_node and environment_node.environment.sky:
		_sky_material = environment_node.environment.sky.sky_material as ShaderMaterial
	set_wind(direction_deg, strength)


func set_wind(new_direction_deg: float, new_strength: float) -> void:
	direction_deg = new_direction_deg
	strength = new_strength
	var rad := deg_to_rad(direction_deg)
	var dir := Vector2(sin(rad), cos(rad))
	RenderingServer.global_shader_parameter_set("wind_direction", dir)
	if grass_material:
		grass_material.set_shader_parameter("wind_strength", grass_wind_strength * strength)
	if ground_material:
		ground_material.set_shader_parameter("wind_strength", ground_wind_strength * strength)
	if _sky_material:
		_sky_material.set_shader_parameter("clouds_speed", strength * cloud_speed_scale)
	Game.events.notify(EventNames.WIND_CHANGED, {"direction_deg": direction_deg, "strength": strength})
