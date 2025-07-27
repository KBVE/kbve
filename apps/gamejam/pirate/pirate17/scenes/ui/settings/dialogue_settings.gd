class_name DialogueSettings
extends Control

signal dialogue_settings_closed

@onready var speaker_name: Label = $Panel/TitleContainer/SpeakerName
@onready var dialogue_text: RichTextLabel = $Panel/ContentContainer/DialogueText
@onready var choice_container: VBoxContainer = $Panel/ContentContainer/ChoiceContainer

var dialogue_system: Node
var original_pause_state: bool = false

func _ready():
	z_index = 1000
	process_mode = Node.PROCESS_MODE_WHEN_PAUSED
	
	dialogue_system = get_node_or_null("/root/DialogueSystem")
	if not dialogue_system:
		push_error("DialogueSettings: DialogueSystem not found in autoload")
		queue_free()
		return
	
	dialogue_system.set_dialogue_ui(self)
	dialogue_system.dialogue_ended.connect(_on_dialogue_ended)
	
	# Pause the game for dialogue
	original_pause_state = get_tree().paused
	get_tree().paused = true
	
	# Start dialogue
	dialogue_system.open_settings()

func _on_dialogue_ended():
	close_dialogue_settings()

func close_dialogue_settings():
	get_tree().paused = original_pause_state
	dialogue_settings_closed.emit()
	queue_free()

func _input(event):
	if event.is_action_pressed("ui_cancel"):
		if dialogue_system and dialogue_system.is_active:
			dialogue_system.end_dialogue()
		else:
			close_dialogue_settings()
		get_viewport().set_input_as_handled()