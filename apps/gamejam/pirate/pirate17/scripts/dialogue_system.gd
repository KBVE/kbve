extends Node

signal dialogue_started
signal dialogue_ended
signal dialogue_advanced

class DialogueEntry:
	var speaker: String = ""
	var text: String = ""
	var portrait: Texture2D = null
	var choices: Array = []
	
	func _init(p_speaker: String = "", p_text: String = "", p_portrait: Texture2D = null):
		speaker = p_speaker
		text = p_text
		portrait = p_portrait

var current_dialogue: Array = []
var current_index: int = 0
var is_active: bool = false
var dialogue_ui: Control = null
var text_label: RichTextLabel = null
var speaker_label: Label = null
var portrait_sprite: TextureRect = null
var choice_container: VBoxContainer = null
var advance_indicator: Control = null

var text_speed: float = 0.02
var auto_advance: bool = false
var auto_advance_delay: float = 2.0

var _text_timer: Timer
var _auto_timer: Timer
var _current_text: String = ""
var _displayed_text: String = ""

func _ready():
	_text_timer = Timer.new()
	_text_timer.wait_time = text_speed
	_text_timer.timeout.connect(_on_text_timer_timeout)
	add_child(_text_timer)
	
	_auto_timer = Timer.new()
	_auto_timer.wait_time = auto_advance_delay
	_auto_timer.one_shot = true
	_auto_timer.timeout.connect(advance_dialogue)
	add_child(_auto_timer)
	
	set_process_input(false)

func _input(event):
	if not is_active:
		return
		
	if event.is_action_pressed("ui_accept") or event.is_action_pressed("interact"):
		if _text_timer.is_stopped():
			advance_dialogue()
		else:
			complete_text()

func start_dialogue(dialogue_data: Array):
	if dialogue_data.is_empty():
		return
		
	current_dialogue = dialogue_data
	current_index = 0
	is_active = true
	set_process_input(true)
	
	if dialogue_ui:
		dialogue_ui.show()
		
	dialogue_started.emit()
	_display_current_entry()

func advance_dialogue():
	if not is_active:
		return
		
	current_index += 1
	
	if current_index >= current_dialogue.size():
		end_dialogue()
	else:
		dialogue_advanced.emit()
		_display_current_entry()

func end_dialogue():
	is_active = false
	current_dialogue.clear()
	current_index = 0
	set_process_input(false)
	
	if dialogue_ui:
		dialogue_ui.hide()
		
	dialogue_ended.emit()

func _display_current_entry():
	if current_index >= current_dialogue.size():
		return
		
	var entry = current_dialogue[current_index]
	
	if not entry is DialogueEntry:
		push_error("Invalid dialogue entry at index " + str(current_index))
		return
	
	if speaker_label:
		speaker_label.text = entry.speaker
		
	if portrait_sprite and entry.portrait:
		portrait_sprite.texture = entry.portrait
		portrait_sprite.show()
	elif portrait_sprite:
		portrait_sprite.hide()
		
	_current_text = entry.text
	_displayed_text = ""
	
	if text_label:
		text_label.text = ""
		
	if choice_container:
		for child in choice_container.get_children():
			child.queue_free()
			
		if not entry.choices.is_empty():
			_create_choice_buttons(entry.choices)
			if advance_indicator:
				advance_indicator.hide()
		else:
			if advance_indicator:
				advance_indicator.show()
				
	_text_timer.start()

func _create_choice_buttons(choices: Array):
	for i in range(choices.size()):
		var choice = choices[i]
		var button = Button.new()
		button.text = choice.text
		button.pressed.connect(_on_choice_selected.bind(i))
		choice_container.add_child(button)

func _on_choice_selected(index: int):
	var entry = current_dialogue[current_index]
	if index < entry.choices.size():
		var choice = entry.choices[index]
		if choice.has("next_dialogue"):
			start_dialogue(choice.next_dialogue)
		else:
			advance_dialogue()

func _on_text_timer_timeout():
	if _displayed_text.length() < _current_text.length():
		_displayed_text += _current_text[_displayed_text.length()]
		if text_label:
			text_label.text = _displayed_text
	else:
		_text_timer.stop()
		if auto_advance and current_dialogue[current_index].choices.is_empty():
			_auto_timer.start()

func complete_text():
	_text_timer.stop()
	_displayed_text = _current_text
	if text_label:
		text_label.text = _displayed_text
	if auto_advance and current_dialogue[current_index].choices.is_empty():
		_auto_timer.start()

func set_dialogue_ui(ui_node: Control):
	dialogue_ui = ui_node
	
	text_label = dialogue_ui.find_child("DialogueText", true, false) as RichTextLabel
	speaker_label = dialogue_ui.find_child("SpeakerName", true, false) as Label
	portrait_sprite = dialogue_ui.find_child("Portrait", true, false) as TextureRect
	choice_container = dialogue_ui.find_child("ChoiceContainer", true, false) as VBoxContainer
	advance_indicator = dialogue_ui.find_child("AdvanceIndicator", true, false) as Control

func create_simple_dialogue(speaker: String, texts: Array) -> Array:
	var dialogue = []
	for text in texts:
		dialogue.append(DialogueEntry.new(speaker, text))
	return dialogue

func create_branching_dialogue(speaker: String, text: String, choices: Array) -> DialogueEntry:
	var entry = DialogueEntry.new(speaker, text)
	entry.choices = choices
	return entry