extends Node3D

@export_category("Time")
@export var day_length_minutes := 10.0
@export var start_hour := 9.0

@export_category("Celestial Movement")
@export var light_angle_step_deg := 0.15

@export_category("Sun")
@export var sun_max_energy := 1.0
@export var sun_shadow_distance := 80.0

@export_category("Moon")
@export var moon_max_energy := 0.20
@export var moon_shadow_distance := 45.0

@export_category("Shadow Thresholds")
@export var sun_shadow_elevation := 0.04
@export var moon_shadow_elevation := 0.10

var hour: float

var _last_hour := -1
var _last_angle := INF

@onready var sun: DirectionalLight3D = $Sun
@onready var moon: DirectionalLight3D = $Moon


func _ready() -> void:
	hour = start_hour
	_configure_shadows()
	_update_lights(true)


func _process(delta: float) -> void:
	hour = fmod(hour + delta * 24.0 / (day_length_minutes * 60.0), 24.0)
	_update_lights()
	var h := int(hour)
	if h != _last_hour:
		_last_hour = h
		Game.events.notify(EventNames.HOUR_CHANGED, h)


func _configure_shadows() -> void:
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = sun_shadow_distance
	moon.directional_shadow_max_distance = moon_shadow_distance
	sun.directional_shadow_fade_start = 0.85
	moon.directional_shadow_fade_start = 0.80
	sun.directional_shadow_split_1 = 0.18
	moon.directional_shadow_split_1 = 0.22
	sun.directional_shadow_blend_splits = false
	moon.directional_shadow_blend_splits = false


func _update_lights(force := false) -> void:
	var raw_angle := (hour - 6.0) * TAU / 24.0
	var visual_angle := raw_angle
	if light_angle_step_deg > 0.0:
		visual_angle = snappedf(raw_angle, deg_to_rad(light_angle_step_deg))

	var sun_elevation := sin(raw_angle)
	var moon_elevation := -sun_elevation

	var sun_amount := smoothstep(-0.04, 0.20, sun_elevation)
	var moon_amount := smoothstep(-0.02, 0.20, moon_elevation)
	sun.light_energy = sun_amount * sun_max_energy
	moon.light_energy = moon_amount * moon_max_energy

	var sun_casts_shadow := sun_elevation > sun_shadow_elevation
	var moon_casts_shadow := moon_elevation > moon_shadow_elevation and not sun_casts_shadow
	if sun.shadow_enabled != sun_casts_shadow:
		sun.shadow_enabled = sun_casts_shadow
	if moon.shadow_enabled != moon_casts_shadow:
		moon.shadow_enabled = moon_casts_shadow

	sun.shadow_opacity = smoothstep(sun_shadow_elevation, 0.18, sun_elevation)
	moon.shadow_opacity = smoothstep(moon_shadow_elevation, 0.25, moon_elevation) * 0.55

	if force or not is_equal_approx(visual_angle, _last_angle):
		_last_angle = visual_angle
		sun.rotation.x = -visual_angle
		moon.rotation.x = -visual_angle + PI
