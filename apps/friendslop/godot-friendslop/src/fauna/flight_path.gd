class_name FlightPath
extends RefCounted

var species: BirdSpecies
var phase := 0.0
var time := 0.0
var orbit_angle := 0.0
var swoop := 0.0
var glide := 0.0
var flap_energy := 1.0
var wing_phase := 0.0
var turn := 0.0
var _prev_yaw := 0.0


func setup(s: BirdSpecies, p: float) -> void:
	species = s
	phase = p
	time = p
	orbit_angle = p
	wing_phase = p


func step(entity: Node3D, target: Node3D, delta: float) -> void:
	time += delta
	swoop = smoothstep(0.8, 0.95, sin(time * 0.17 + phase * 7.0))
	glide = smoothstep(0.3, 0.7, sin(time * 0.31 + phase * 2.0) * 0.5 + 0.5) * species.glide_blend
	glide *= 1.0 - swoop
	flap_energy = lerpf(flap_energy, 1.0 - glide, 1.0 - exp(-2.0 * delta))
	wing_phase += delta * species.flap_speed * (1.0 + swoop * 0.6)

	if not target:
		return
	orbit_angle += delta * species.orbit_speed * (1.0 + 0.3 * sin(time * 0.11 + phase * 5.0) + swoop * 0.8)
	var radius := species.orbit_radius * (1.0 + 0.25 * sin(time * 0.07 + phase * 11.0))
	var height := species.orbit_height * (1.0 + 0.2 * sin(time * 0.05 + phase * 13.0)) - swoop * species.swoop_depth
	var bob := sin(time * 1.7 + phase * 3.0) * 0.6 - sin(wing_phase) * 0.12 * flap_energy
	var goal := target.global_position + Vector3(
		cos(orbit_angle) * radius,
		height + bob,
		sin(orbit_angle) * radius)
	var prev := entity.global_position
	entity.global_position = prev.lerp(goal, 1.0 - exp(-species.follow_speed * delta))
	var vel := entity.global_position - prev
	var flat := Vector3(vel.x, 0.0, vel.z)
	if flat.length_squared() > 0.00001:
		var yaw := atan2(flat.x, flat.z) + species.model_yaw_fix
		entity.rotation.y = lerp_angle(entity.rotation.y, yaw, 1.0 - exp(-6.0 * delta))
		var yaw_rate := wrapf(entity.rotation.y - _prev_yaw, -PI, PI) / maxf(delta, 0.0001)
		turn = lerpf(turn, clampf(yaw_rate, -2.0, 2.0), 1.0 - exp(-4.0 * delta))
		entity.rotation.z = lerp_angle(entity.rotation.z, clampf(-turn * 0.55, -0.7, 0.7), 1.0 - exp(-3.0 * delta))
		entity.rotation.x = lerp_angle(entity.rotation.x, clampf(-vel.y * 1.5, -0.4, 0.4) - 0.08 - swoop * 0.25, 1.0 - exp(-3.0 * delta))
	_prev_yaw = entity.rotation.y
