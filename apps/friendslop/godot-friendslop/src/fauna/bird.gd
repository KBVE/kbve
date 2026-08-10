class_name Bird
extends Node3D

@export var species: BirdSpecies
@export var target_path: NodePath
@export var phase := 0.0

var flight := FlightPath.new()
var rig := WingRig.new()


func _ready() -> void:
	if not species:
		return
	if species.model and get_child_count() == 0:
		var model := species.model.instantiate()
		add_child(model)
		model.scale = Vector3.ONE * species.scale
		model.rotation.x = species.model_pitch_fix
	flight.setup(species, phase)
	rig.setup(species, self)


func _process(delta: float) -> void:
	if not species:
		return
	var target := get_node_or_null(target_path) as Node3D
	flight.step(self, target, delta)
	rig.step(flight)
