extends Control

@onready var panel: Panel = $Panel
@onready var speaker_name: Label = $Panel/SpeakerName
@onready var dialogue_text: RichTextLabel = $Panel/DialogueText
@onready var portrait: TextureRect = $Panel/Portrait
@onready var choice_container: VBoxContainer = $Panel/ChoiceContainer
@onready var advance_indicator: AnimationPlayer = $Panel/AdvanceIndicator

var dialogue_system: Node

func _ready():
	hide()
	
	var dialogue_node = get_node("/root/DialogueSystem")
	if dialogue_node:
		dialogue_system = dialogue_node
		dialogue_system.set_dialogue_ui(self)
		dialogue_system.dialogue_started.connect(_on_dialogue_started)
		dialogue_system.dialogue_ended.connect(_on_dialogue_ended)

func _on_dialogue_started():
	show()
	if advance_indicator:
		advance_indicator.play("blink")

func _on_dialogue_ended():
	hide()
	if advance_indicator:
		advance_indicator.stop()

func set_speaker(speaker_name_text: String):
	if speaker_name:
		speaker_name.text = speaker_name_text
		speaker_name.visible = speaker_name_text != ""

func set_dialogue_text(text: String):
	if dialogue_text:
		dialogue_text.text = text

func set_portrait(texture: Texture2D):
	if portrait:
		if texture:
			portrait.texture = texture
			portrait.show()
		else:
			portrait.hide()

func clear_choices():
	if choice_container:
		for child in choice_container.get_children():
			child.queue_free()

func add_choice(text: String) -> Button:
	if not choice_container:
		return null
		
	var button = Button.new()
	button.text = text
	choice_container.add_child(button)
	return button