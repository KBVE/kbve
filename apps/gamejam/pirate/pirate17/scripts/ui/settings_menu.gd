class_name SettingsMenu
extends Control

signal settings_closed

@onready var panel: Panel = $Panel
@onready var speaker_name: Label = $Panel/TitleContainer/SpeakerName
@onready var dialogue_text: RichTextLabel = $Panel/ContentContainer/DialogueText
@onready var choice_container: VBoxContainer = $Panel/ContentContainer/ChoiceContainer
@onready var close_button: TextureButton = $Panel/CloseButton

var dialogue_system: Node
var original_pause_state: bool = false

func _ready():
	# Set high z-index to ensure it's on top
	z_index = 1000
	
	# Apply fantasy UI theme
	_apply_fantasy_theme()
	
	# Set up close button
	if close_button:
		close_button.pressed.connect(_on_close_pressed)
		# Add hover effects
		close_button.mouse_entered.connect(_on_close_button_hover)
		close_button.mouse_exited.connect(_on_close_button_exit)
		# Set initial scale
		close_button.pivot_offset = close_button.size / 2
	
	# Get or create dialogue system
	dialogue_system = get_node_or_null("/root/DialogueSystem")
	if not dialogue_system:
		print("SettingsMenu: DialogueSystem not found in autoload")
		return
	
	# Set up dialogue UI
	dialogue_system.set_dialogue_ui(self)
	
	# Connect dialogue ended signal
	dialogue_system.dialogue_ended.connect(_on_dialogue_ended)
	
	# Store original pause state and pause the game
	original_pause_state = get_tree().paused
	get_tree().paused = true
	
	# Make sure this menu can process when paused
	process_mode = Node.PROCESS_MODE_WHEN_PAUSED
	
	# Start settings dialogue
	dialogue_system.open_settings()

func _apply_fantasy_theme():
	# Apply additional runtime styling if needed
	# The button theme is already set in the scene file
	
	# Make sure choice buttons get proper styling
	if choice_container:
		# Connect to child entered tree to style dynamically created buttons
		choice_container.child_entered_tree.connect(_on_choice_button_added)

func _on_dialogue_ended():
	# Close the settings menu when dialogue ends
	close_settings()

func _on_close_pressed():
	# End dialogue if active
	if dialogue_system and dialogue_system.is_active:
		dialogue_system.end_dialogue()
	else:
		close_settings()

func close_settings():
	# Restore original pause state
	get_tree().paused = original_pause_state
	
	# Emit signal that settings are closed
	settings_closed.emit()
	
	# Remove this scene
	queue_free()

func _input(event):
	# Allow ESC to close settings
	if event.is_action_pressed("ui_cancel"):
		_on_close_pressed()
		get_viewport().set_input_as_handled()

func _on_choice_button_added(node: Node):
	# Apply styling to dynamically created choice buttons
	if node is Button:
		var button = node as Button
		# Set minimum size for better appearance
		button.custom_minimum_size = Vector2(300, 40)
		# Center the text
		button.alignment = HORIZONTAL_ALIGNMENT_CENTER

func _on_close_button_hover():
	# Scale up the close button on hover
	if close_button:
		var tween = create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_ELASTIC)
		tween.tween_property(close_button, "scale", Vector2(1.2, 1.2), 0.2)

func _on_close_button_exit():
	# Scale back to normal when mouse exits
	if close_button:
		var tween = create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_CUBIC)
		tween.tween_property(close_button, "scale", Vector2(1.0, 1.0), 0.15)