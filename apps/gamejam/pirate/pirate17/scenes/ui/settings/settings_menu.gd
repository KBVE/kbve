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
	z_index = 1000
	
	_apply_fantasy_theme()
	
	if close_button:
		close_button.pressed.connect(_on_close_pressed)
		close_button.mouse_entered.connect(_on_close_button_hover)
		close_button.mouse_exited.connect(_on_close_button_exit)
		close_button.pivot_offset = close_button.size / 2
	
	dialogue_system = get_node_or_null("/root/DialogueSystem")
	if not dialogue_system:
		print("SettingsMenu: DialogueSystem not found in autoload")
		return
	
	dialogue_system.set_dialogue_ui(self)
	
	dialogue_system.dialogue_ended.connect(_on_dialogue_ended)
	
	original_pause_state = get_tree().paused
	get_tree().paused = true
	
	process_mode = Node.PROCESS_MODE_WHEN_PAUSED
	
	dialogue_system.open_settings()

func _apply_fantasy_theme():
	if choice_container:
		choice_container.child_entered_tree.connect(_on_choice_button_added)

func _on_dialogue_ended():
	close_settings()

func _on_close_pressed():
	if dialogue_system and dialogue_system.is_active:
		dialogue_system.end_dialogue()
	else:
		close_settings()

func close_settings():
	get_tree().paused = original_pause_state
	
	settings_closed.emit()
	
	queue_free()

func _input(event):
	if event.is_action_pressed("ui_cancel"):
		_on_close_pressed()
		get_viewport().set_input_as_handled()

func _on_choice_button_added(node: Node):
	if node is Button:
		var button = node as Button
		button.custom_minimum_size = Vector2(300, 40)
		button.alignment = HORIZONTAL_ALIGNMENT_CENTER

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