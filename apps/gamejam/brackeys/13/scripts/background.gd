extends Node2D

@onready var timespace_layer = $TimespaceLayer
@onready var universe_layer = $UniverseLayer
@onready var galaxy_layer = $GalaxyLayer
@onready var environment_layer = $EnvironmentLayer

func _ready():
	self.z_index = -1
