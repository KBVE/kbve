class_name Climate
extends Node

const CLEAR := 0
const RAINING := 1 << 0
const SNOWING := 1 << 1
const FOGGY := 1 << 2
const OVERCAST := 1 << 3
const STORM := 1 << 4
const ECLIPSE := 1 << 5

@export var environment_node: WorldEnvironment
@export var clear_fog_density := 0.012
@export var foggy_fog_density := 0.035

var flags := CLEAR

var _sky_material: ShaderMaterial


func _ready() -> void:
	if environment_node and environment_node.environment.sky:
		_sky_material = environment_node.environment.sky.sky_material as ShaderMaterial
	_apply()


func has_flag(flag: int) -> bool:
	return flags & flag != 0


func add_flags(new_flags: int) -> void:
	set_flags(flags | new_flags)


func remove_flags(old_flags: int) -> void:
	set_flags(flags & ~old_flags)


func set_flags(new_flags: int) -> void:
	if new_flags == flags:
		return
	flags = new_flags
	_apply()
	Game.events.notify(EventNames.WEATHER_CHANGED, flags)


func _apply() -> void:
	var clouds_weight := 0.0
	var clouds_cutoff := 0.3
	if flags & OVERCAST:
		clouds_weight = 0.4
		clouds_cutoff = 0.22
	if flags & (RAINING | SNOWING):
		clouds_weight = 0.6
		clouds_cutoff = 0.18
	if flags & STORM:
		clouds_weight = 0.9
		clouds_cutoff = 0.12
	if _sky_material:
		_sky_material.set_shader_parameter("clouds_weight", clouds_weight)
		_sky_material.set_shader_parameter("clouds_cutoff", clouds_cutoff)
	if environment_node:
		environment_node.environment.fog_density = foggy_fog_density if flags & FOGGY else clear_fog_density
