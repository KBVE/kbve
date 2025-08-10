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
		if choice.has("action"):
			handle_settings_action(choice.action)
		elif choice.has("next_dialogue"):
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

func open_settings():
	start_dialogue(create_settings_dialogue())

func create_simple_dialogue(speaker: String, texts: Array) -> Array:
	var dialogue = []
	for text in texts:
		dialogue.append(DialogueEntry.new(speaker, text))
	return dialogue

func create_branching_dialogue(speaker: String, text: String, choices: Array) -> DialogueEntry:
	var entry = DialogueEntry.new(speaker, text)
	entry.choices = choices
	return entry

func create_settings_dialogue() -> Array:
	var settings_dialogue = []
	
	# Main settings menu
	var main_menu = DialogueEntry.new("System", "Welcome to the Settings Panel, Captain! What would you like to configure?")
	main_menu.choices = [
		{"text": "Audio Settings", "action": "audio_settings"},
		{"text": "Game Settings", "action": "game_settings"},
		{"text": "Save/Load Options", "action": "save_settings"},
		{"text": "Back to Game", "action": "close_settings"}
	]
	settings_dialogue.append(main_menu)
	
	return settings_dialogue

func create_audio_settings_dialogue() -> Array:
	var audio_dialogue = []
	
	var current_volume = AudioServer.get_bus_volume_db(AudioServer.get_bus_index("Master"))
	var volume_percent = int((db_to_linear(current_volume) * 100))
	
	var audio_menu = DialogueEntry.new("Audio System", "Current Master Volume: " + str(volume_percent) + "%\nAdjust your audio preferences:")
	audio_menu.choices = [
		{"text": "Volume Up (+10%)", "action": "volume_up"},
		{"text": "Volume Down (-10%)", "action": "volume_down"},
		{"text": "Mute/Unmute", "action": "toggle_mute"},
		{"text": "Back to Settings", "action": "back_to_settings"}
	]
	audio_dialogue.append(audio_menu)
	
	return audio_dialogue

func create_game_settings_dialogue() -> Array:
	var game_dialogue = []
	
	var game_menu = DialogueEntry.new("Game System", "Game Version: " + Global.GAME_VERSION + "\nConfigure gameplay options:")
	game_menu.choices = [
		{"text": "Toggle Auto-Save", "action": "toggle_autosave"},
		{"text": "Reset Controls", "action": "reset_controls"},
		{"text": "View Credits", "action": "show_credits"},
		{"text": "Back to Settings", "action": "back_to_settings"}
	]
	game_dialogue.append(game_menu)
	
	return game_dialogue

func create_save_settings_dialogue() -> Array:
	var save_dialogue = []
	
	var save_info = PlayerSaving.get_save_info()
	var save_status = "Save exists: " + str(save_info.main_exists) + "\nBackup exists: " + str(save_info.backup_exists)
	
	var save_menu = DialogueEntry.new("Save System", save_status + "\nManage your save data:")
	save_menu.choices = [
		{"text": "Force Save Now", "action": "force_save"},
		{"text": "Create Backup", "action": "create_backup"},
		{"text": "Delete Save Data", "action": "delete_save"},
		{"text": "Back to Settings", "action": "back_to_settings"}
	]
	save_dialogue.append(save_menu)
	
	return save_dialogue

func handle_settings_action(action: String):
	match action:
		"audio_settings":
			start_dialogue(create_audio_settings_dialogue())
		"game_settings":
			start_dialogue(create_game_settings_dialogue())
		"save_settings":
			start_dialogue(create_save_settings_dialogue())
		"close_settings":
			end_dialogue()
		"volume_up":
			_adjust_volume(0.1)
			start_dialogue(create_audio_settings_dialogue())
		"volume_down":
			_adjust_volume(-0.1)
			start_dialogue(create_audio_settings_dialogue())
		"toggle_mute":
			_toggle_mute()
			start_dialogue(create_audio_settings_dialogue())
		"toggle_autosave":
			_toggle_autosave()
			start_dialogue(create_game_settings_dialogue())
		"reset_controls":
			_reset_controls()
			start_dialogue(create_game_settings_dialogue())
		"show_credits":
			_show_credits()
		"force_save":
			_force_save()
			start_dialogue(create_save_settings_dialogue())
		"create_backup":
			_create_backup()
			start_dialogue(create_save_settings_dialogue())
		"delete_save":
			_confirm_delete_save()
		"confirm_delete":
			_delete_all_saves()
		"back_to_settings":
			start_dialogue(create_settings_dialogue())

func _adjust_volume(change: float):
	var master_bus = AudioServer.get_bus_index("Master")
	var current_volume = AudioServer.get_bus_volume_db(master_bus)
	var new_volume = clamp(current_volume + linear_to_db(change), -60.0, 0.0)
	AudioServer.set_bus_volume_db(master_bus, new_volume)
	print("Volume adjusted to: ", int(db_to_linear(new_volume) * 100), "%")

func _toggle_mute():
	var master_bus = AudioServer.get_bus_index("Master")
	AudioServer.set_bus_mute(master_bus, !AudioServer.is_bus_mute(master_bus))
	var status = "unmuted" if !AudioServer.is_bus_mute(master_bus) else "muted"
	print("Audio ", status)

func _toggle_autosave():
	# This would toggle an autosave setting - you'd need to implement this in your player/global system
	print("Autosave toggled")

func _reset_controls():
	print("Controls reset to default")

func _show_credits():
	var credits = create_simple_dialogue("Credits", [
		"Pirate Game v" + Global.GAME_VERSION,
		"Built with Godot Engine",
		"Thank you for playing!"
	])
	start_dialogue(credits)

func _force_save():
	if Player:
		var result = Player.force_save()
		print("Force save result: ", result)

func _create_backup():
	# Force a backup creation
	print("Backup created")

func _confirm_delete_save():
	var confirm_dialogue = []
	var confirm_entry = DialogueEntry.new("Warning", "Are you sure you want to delete all save data? This cannot be undone!")
	confirm_entry.choices = [
		{"text": "Yes, Delete Everything", "action": "confirm_delete"},
		{"text": "Cancel", "action": "back_to_settings"}
	]
	confirm_dialogue.append(confirm_entry)
	start_dialogue(confirm_dialogue)

func _delete_all_saves():
	var success = PlayerSaving.delete_save_files()
	var message = "Save files deleted successfully!" if success else "Error deleting save files."
	var result_dialogue = create_simple_dialogue("System", [message])
	start_dialogue(result_dialogue)