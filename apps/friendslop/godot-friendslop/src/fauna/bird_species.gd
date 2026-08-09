class_name BirdSpecies
extends Resource

@export var model: PackedScene
@export var scale := 1.0

@export_group("Wings")
@export var flap_speed := 9.0
@export var flap_amount := 0.9
@export var flap_axis := Vector3(1.0, 0.0, 0.0)
@export var wing_chain: Array[String] = ["Wing.L", "Wing.R", "Wing.001.L", "Wing.001.R", "Wing.002.L", "Wing.002.R"]
@export var chain_falloff: Array[float] = [1.0, 1.0, 0.6, 0.6, 0.45, 0.45]
@export var chain_lag: Array[float] = [0.0, 0.0, -0.45, -0.45, -0.9, -0.9]

@export_group("Body")
@export var spine_bones: Array[String] = ["spine", "spine.001"]
@export var neck_bones: Array[String] = ["neck.001", "neck.002"]
@export var tail_bones: Array[String] = ["t_feather.L", "t_feather.R"]
@export var leg_bones: Array[String] = ["thigh.L", "thigh.R"]
@export var body_pitch_amount := 0.06
@export var tail_amount := 0.12
@export var leg_tuck := 2.0
@export var twist_amount := 0.18
@export var turn_flap_asymmetry := 0.35

@export_group("Flight")
@export var orbit_radius := 6.0
@export var orbit_height := 4.5
@export var orbit_speed := 0.5
@export var follow_speed := 2.5
@export var glide_blend := 0.35
@export var swoop_depth := 2.2
@export var model_yaw_fix := 0.0
@export var model_pitch_fix := -0.3
