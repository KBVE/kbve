extends Control

signal smoothing_changed(value: float)
signal offset_changed(value: float)
signal deadzone_changed(value: float)

@onready var smoothing_slider: HSlider = $VBoxContainer/SmoothingContainer/SmoothingSlider
@onready var smoothing_label: Label = $VBoxContainer/SmoothingContainer/SmoothingValue
@onready var offset_slider: HSlider = $VBoxContainer/OffsetContainer/OffsetSlider
@onready var offset_label: Label = $VBoxContainer/OffsetContainer/OffsetValue
@onready var deadzone_slider: HSlider = $VBoxContainer/DeadzoneContainer/DeadzoneSlider
@onready var deadzone_label: Label = $VBoxContainer/DeadzoneContainer/DeadzoneValue

var main_scene: Node2D

func _ready():
	# Find main scene
	var main_scenes = get_tree().get_nodes_in_group("main_scene")
	if main_scenes.size() > 0:
		main_scene = main_scenes[0]
		initialize_values()
	
	# Connect slider signals
	smoothing_slider.value_changed.connect(_on_smoothing_changed)
	offset_slider.value_changed.connect(_on_offset_changed)
	deadzone_slider.value_changed.connect(_on_deadzone_changed)

func initialize_values():
	if not main_scene:
		return
		
	# Set initial slider values from main scene
	smoothing_slider.value = main_scene.camera_smoothing
	offset_slider.value = main_scene.camera_offset_strength
	deadzone_slider.value = main_scene.camera_deadzone_radius
	
	# Update labels
	smoothing_label.text = str(smoothing_slider.value)
	offset_label.text = str(offset_slider.value)
	deadzone_label.text = str(int(deadzone_slider.value))

func _on_smoothing_changed(value: float):
	smoothing_label.text = str(value)
	if main_scene:
		main_scene.camera_smoothing = value
	smoothing_changed.emit(value)

func _on_offset_changed(value: float):
	offset_label.text = str(value)
	if main_scene:
		main_scene.camera_offset_strength = value
	offset_changed.emit(value)

func _on_deadzone_changed(value: float):
	deadzone_label.text = str(int(value))
	if main_scene:
		main_scene.camera_deadzone_radius = value
	deadzone_changed.emit(value)