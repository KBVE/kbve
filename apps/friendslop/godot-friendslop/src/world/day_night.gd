extends Node3D

@export_category("Time")
@export var day_length_minutes := 10.0
@export var start_hour := 9.0

@export_category("Celestial Movement")
@export_range(0.01, 1.0, 0.01) var light_angle_step_deg := 0.15

@export_category("Sun")
@export var sun_max_energy := 1.0
@export var sun_shadow_distance := 80.0
@export_range(0.0, 1.0, 0.01) var sun_angular_distance := 0.25

@export_category("Moon")
@export var moon_max_energy := 0.20
@export var moon_shadow_distance := 45.0

@export_category("Shadow Thresholds")
@export var sun_shadow_enable_elevation := 0.05
@export var sun_shadow_disable_elevation := 0.02
@export var moon_shadow_enable_elevation := 0.12
@export var moon_shadow_disable_elevation := 0.07

const HOURS_PER_DAY := 24.0
const SUNRISE_OFFSET := 6.0
const DAY_RADIANS := TAU / HOURS_PER_DAY

const SUN_ENERGY_START := -0.04
const SUN_ENERGY_FULL := 0.20
const MOON_ENERGY_START := -0.02
const MOON_ENERGY_FULL := 0.20

const SUN_SHADOW_FULL := 0.18
const MOON_SHADOW_FULL := 0.25
const MOON_SHADOW_MAX_OPACITY := 0.45

const LUT_STRIDE := 5
const LUT_SUN_ENERGY := 0
const LUT_MOON_ENERGY := 1
const LUT_SUN_OPACITY := 2
const LUT_MOON_OPACITY := 3
const LUT_SUN_ELEVATION := 4

var hour: float

var _hours_per_second: float
var _angle_step_rad: float
var _angle_step_inv: float
var _steps_per_day: int
var _lut: PackedFloat32Array

var _last_hour := -1
var _last_angle_step := -1

var _sun_shadow_active := false
var _moon_shadow_active := false

@onready var sun: DirectionalLight3D = $Sun
@onready var moon: DirectionalLight3D = $Moon


func _ready() -> void:
	hour = start_hour
	_rebuild_constants()
	_configure_lights()
	_update_celestial_state(true)


func _process(delta: float) -> void:
	hour += delta * _hours_per_second
	if hour >= HOURS_PER_DAY:
		hour -= HOURS_PER_DAY

	var current_hour := int(hour)
	if current_hour != _last_hour:
		_last_hour = current_hour
		Game.events.notify(EventNames.HOUR_CHANGED, current_hour)

	_update_celestial_state()


func _rebuild_constants() -> void:
	_hours_per_second = HOURS_PER_DAY / (day_length_minutes * 60.0)
	_angle_step_rad = deg_to_rad(light_angle_step_deg)
	_angle_step_inv = 1.0 / _angle_step_rad
	_steps_per_day = maxi(1, roundi(TAU * _angle_step_inv))
	_lut.resize(_steps_per_day * LUT_STRIDE)
	for i in _steps_per_day:
		var sun_elevation := sin(float(i) * _angle_step_rad)
		var moon_elevation := -sun_elevation
		var o := i * LUT_STRIDE
		_lut[o + LUT_SUN_ENERGY] = smoothstep(SUN_ENERGY_START, SUN_ENERGY_FULL, sun_elevation) * sun_max_energy
		_lut[o + LUT_MOON_ENERGY] = smoothstep(MOON_ENERGY_START, MOON_ENERGY_FULL, moon_elevation) * moon_max_energy
		_lut[o + LUT_SUN_OPACITY] = smoothstep(sun_shadow_enable_elevation, SUN_SHADOW_FULL, sun_elevation)
		_lut[o + LUT_MOON_OPACITY] = smoothstep(moon_shadow_enable_elevation, MOON_SHADOW_FULL, moon_elevation) * MOON_SHADOW_MAX_OPACITY
		_lut[o + LUT_SUN_ELEVATION] = sun_elevation


func _configure_lights() -> void:
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = sun_shadow_distance
	sun.directional_shadow_fade_start = 0.85
	sun.directional_shadow_split_1 = 0.18
	sun.directional_shadow_blend_splits = false
	sun.light_angular_distance = sun_angular_distance

	moon.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	moon.directional_shadow_max_distance = moon_shadow_distance
	moon.directional_shadow_fade_start = 0.80
	moon.directional_shadow_blend_splits = false
	moon.light_angular_distance = 0.0


func _update_celestial_state(force := false) -> void:
	var raw_angle := (hour - SUNRISE_OFFSET) * DAY_RADIANS
	var angle_step := roundi(raw_angle * _angle_step_inv)
	if not force and angle_step == _last_angle_step:
		return
	_last_angle_step = angle_step

	var angle := float(angle_step) * _angle_step_rad
	var o := posmod(angle_step, _steps_per_day) * LUT_STRIDE
	var sun_elevation := _lut[o + LUT_SUN_ELEVATION]
	var moon_elevation := -sun_elevation

	sun.light_energy = _lut[o + LUT_SUN_ENERGY]
	moon.light_energy = _lut[o + LUT_MOON_ENERGY]
	_update_shadow_state(sun_elevation, moon_elevation)
	sun.shadow_opacity = _lut[o + LUT_SUN_OPACITY]
	moon.shadow_opacity = _lut[o + LUT_MOON_OPACITY]

	sun.rotation.x = -angle
	moon.rotation.x = -angle + PI


func _update_shadow_state(sun_elevation: float, moon_elevation: float) -> void:
	if _sun_shadow_active:
		if sun_elevation < sun_shadow_disable_elevation:
			_sun_shadow_active = false
	elif sun_elevation > sun_shadow_enable_elevation:
		_sun_shadow_active = true

	if _moon_shadow_active:
		if moon_elevation < moon_shadow_disable_elevation or _sun_shadow_active:
			_moon_shadow_active = false
	elif moon_elevation > moon_shadow_enable_elevation and not _sun_shadow_active:
		_moon_shadow_active = true

	if sun.shadow_enabled != _sun_shadow_active:
		sun.shadow_enabled = _sun_shadow_active
	if moon.shadow_enabled != _moon_shadow_active:
		moon.shadow_enabled = _moon_shadow_active
