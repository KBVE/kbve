class_name SettingsMenu
extends Control

signal settings_closed

@onready var panel: Panel = $Panel
@onready var close_button: TextureButton = $Panel/CloseButton
@onready var content_container: VBoxContainer = $Panel/ContentContainer
@onready var title_label: Label = $Panel/TitleContainer/TitleLabel

var original_pause_state: bool = false

func _ready():
	# High z-index for proper layering
	z_index = 1000
	
	# Ensure the settings menu can receive input during pause
	process_mode = Node.PROCESS_MODE_WHEN_PAUSED
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Store original pause state and pause the game
	original_pause_state = get_tree().paused
	get_tree().paused = true
	
	# Setup UI
	_setup_ui()
	
	# Grab focus to ensure we receive input
	grab_focus()

func _setup_ui():
	if close_button:
		close_button.pressed.connect(_on_close_pressed)
		close_button.mouse_entered.connect(_on_close_button_hover)
		close_button.mouse_exited.connect(_on_close_button_exit)
		close_button.pivot_offset = close_button.size / 2
	
	if title_label:
		title_label.text = "Settings"
	
	# Add settings options here
	_create_settings_options()

func _create_settings_options():
	# Create volume slider
	var volume_container = HBoxContainer.new()
	var volume_label = Label.new()
	volume_label.text = "Master Volume:"
	volume_label.custom_minimum_size.x = 120
	
	var volume_slider = HSlider.new()
	volume_slider.min_value = 0.0
	volume_slider.max_value = 1.0
	volume_slider.value = 0.7
	volume_slider.custom_minimum_size.x = 200
	volume_slider.value_changed.connect(_on_volume_changed)
	
	volume_container.add_child(volume_label)
	volume_container.add_child(volume_slider)
	content_container.add_child(volume_container)
	
	# Create fullscreen toggle
	var fullscreen_check = CheckBox.new()
	fullscreen_check.text = "Fullscreen"
	fullscreen_check.toggled.connect(_on_fullscreen_toggled)
	content_container.add_child(fullscreen_check)
	
	# Add spacing
	var spacer = Control.new()
	spacer.custom_minimum_size.y = 20
	content_container.add_child(spacer)
	
	# Add music control button
	var music_button = Button.new()
	music_button.text = "Music Settings"
	music_button.pressed.connect(_on_music_settings_pressed)
	content_container.add_child(music_button)

func _on_close_pressed():
	close_settings()

func close_settings():
	# Restore pause state
	get_tree().paused = original_pause_state
	
	# Emit signal and clean up
	settings_closed.emit()
	queue_free()

func _input(event):
	if event.is_action_pressed("ui_cancel"):
		_on_close_pressed()
		get_viewport().set_input_as_handled()

func _on_close_button_hover():
	if close_button:
		var tween = create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_ELASTIC)
		tween.tween_property(close_button, "scale", Vector2(1.2, 1.2), 0.2)

func _on_close_button_exit():
	if close_button:
		var tween = create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_CUBIC)
		tween.tween_property(close_button, "scale", Vector2(1.0, 1.0), 0.15)

func _on_volume_changed(value: float):
	# Update master volume
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Master"), linear_to_db(value))
	print("Volume changed to: ", value)

func _on_fullscreen_toggled(enabled: bool):
	if enabled:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)

func _on_music_settings_pressed():
	# Show music UI if available
	var music_ui = get_node_or_null("/root/MusicUIUX")
	if music_ui and music_ui.has_method("toggle_music_ui"):
		music_ui.toggle_music_ui()
	else:
		print("Music UI not available")