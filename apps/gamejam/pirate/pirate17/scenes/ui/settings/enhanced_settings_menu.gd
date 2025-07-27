class_name EnhancedSettingsMenu
extends Control

signal settings_closed

@onready var panel: Panel = $Panel
@onready var close_button: TextureButton = $Panel/CloseButton
@onready var tab_container: TabContainer = $Panel/TabContainer

# Audio tab nodes
@onready var master_slider: HSlider = $Panel/TabContainer/Audio/VBoxContainer/MasterVolume/HBoxContainer/VolumeSlider
@onready var master_label: Label = $Panel/TabContainer/Audio/VBoxContainer/MasterVolume/HBoxContainer/VolumeLabel
@onready var music_slider: HSlider = $Panel/TabContainer/Audio/VBoxContainer/MusicVolume/HBoxContainer/VolumeSlider
@onready var music_label: Label = $Panel/TabContainer/Audio/VBoxContainer/MusicVolume/HBoxContainer/VolumeLabel
@onready var sfx_slider: HSlider = $Panel/TabContainer/Audio/VBoxContainer/SFXVolume/HBoxContainer/VolumeSlider
@onready var sfx_label: Label = $Panel/TabContainer/Audio/VBoxContainer/SFXVolume/HBoxContainer/VolumeLabel

# Game tab nodes
@onready var save_button: Button = $Panel/TabContainer/Game/VBoxContainer/SaveLoadSection/SaveButton
@onready var load_button: Button = $Panel/TabContainer/Game/VBoxContainer/SaveLoadSection/LoadButton
@onready var clear_data_button: Button = $Panel/TabContainer/Game/VBoxContainer/DataSection/ClearDataButton
@onready var backup_button: Button = $Panel/TabContainer/Game/VBoxContainer/DataSection/BackupButton
@onready var restore_button: Button = $Panel/TabContainer/Game/VBoxContainer/DataSection/RestoreButton

var original_pause_state: bool = false
var save_manager: Node

func _ready():
	# Ensure high priority for input
	z_index = 1000
	process_mode = Node.PROCESS_MODE_WHEN_PAUSED
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Pause the game
	original_pause_state = get_tree().paused
	get_tree().paused = true
	
	# Get save manager reference
	save_manager = get_node_or_null("/root/SaveManager")
	
	# Setup UI
	_setup_ui()
	_load_settings()
	
	# Ensure we can receive input
	set_process_unhandled_input(true)
	grab_focus()
	
	# Make the background block input
	if has_node("Background"):
		var bg = $Background
		bg.mouse_filter = Control.MOUSE_FILTER_STOP
		bg.gui_input.connect(_on_background_input)

func _setup_ui():
	# Connect close button
	if close_button:
		close_button.pressed.connect(_on_close_pressed)
		close_button.mouse_entered.connect(_on_close_button_hover)
		close_button.mouse_exited.connect(_on_close_button_exit)
		close_button.pivot_offset = close_button.size / 2
	
	# Connect audio sliders
	if master_slider:
		master_slider.value_changed.connect(_on_master_volume_changed)
		var dec_button = $Panel/TabContainer/Audio/VBoxContainer/MasterVolume/HBoxContainer/DecreaseButton
		var inc_button = $Panel/TabContainer/Audio/VBoxContainer/MasterVolume/HBoxContainer/IncreaseButton
		if dec_button:
			dec_button.pressed.connect(func(): _adjust_volume(master_slider, -0.1))
		if inc_button:
			inc_button.pressed.connect(func(): _adjust_volume(master_slider, 0.1))
	
	if music_slider:
		music_slider.value_changed.connect(_on_music_volume_changed)
		var dec_button = $Panel/TabContainer/Audio/VBoxContainer/MusicVolume/HBoxContainer/DecreaseButton
		var inc_button = $Panel/TabContainer/Audio/VBoxContainer/MusicVolume/HBoxContainer/IncreaseButton
		if dec_button:
			dec_button.pressed.connect(func(): _adjust_volume(music_slider, -0.1))
		if inc_button:
			inc_button.pressed.connect(func(): _adjust_volume(music_slider, 0.1))
	
	if sfx_slider:
		sfx_slider.value_changed.connect(_on_sfx_volume_changed)
		var dec_button = $Panel/TabContainer/Audio/VBoxContainer/SFXVolume/HBoxContainer/DecreaseButton
		var inc_button = $Panel/TabContainer/Audio/VBoxContainer/SFXVolume/HBoxContainer/IncreaseButton
		if dec_button:
			dec_button.pressed.connect(func(): _adjust_volume(sfx_slider, -0.1))
		if inc_button:
			inc_button.pressed.connect(func(): _adjust_volume(sfx_slider, 0.1))
	
	# Connect game buttons
	if save_button:
		save_button.pressed.connect(_on_save_game)
	if load_button:
		load_button.pressed.connect(_on_load_game)
	if clear_data_button:
		clear_data_button.pressed.connect(_on_clear_data)
	if backup_button:
		backup_button.pressed.connect(_on_backup_data)
	if restore_button:
		restore_button.pressed.connect(_on_restore_data)
	
	# Add display options
	_setup_display_options()

func _setup_display_options():
	var display_tab = $Panel/TabContainer/Display/VBoxContainer
	if not display_tab:
		return
	
	# Fullscreen toggle
	var fullscreen_check = display_tab.get_node_or_null("FullscreenCheck")
	if fullscreen_check:
		fullscreen_check.button_pressed = DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
		fullscreen_check.toggled.connect(_on_fullscreen_toggled)
	
	# VSync toggle
	var vsync_check = display_tab.get_node_or_null("VSyncCheck")
	if vsync_check:
		vsync_check.button_pressed = DisplayServer.window_get_vsync_mode() != DisplayServer.VSYNC_DISABLED
		vsync_check.toggled.connect(_on_vsync_toggled)

func _load_settings():
	# Load saved volume settings
	var master_bus = AudioServer.get_bus_index("Master")
	var music_bus = AudioServer.get_bus_index("Music") 
	var sfx_bus = AudioServer.get_bus_index("SFX")
	
	if master_slider and master_bus != -1:
		master_slider.value = db_to_linear(AudioServer.get_bus_volume_db(master_bus))
		_update_volume_label(master_label, master_slider.value)
	
	if music_slider and music_bus != -1:
		music_slider.value = db_to_linear(AudioServer.get_bus_volume_db(music_bus))
		_update_volume_label(music_label, music_slider.value)
	
	if sfx_slider and sfx_bus != -1:
		sfx_slider.value = db_to_linear(AudioServer.get_bus_volume_db(sfx_bus))
		_update_volume_label(sfx_label, sfx_slider.value)

func _adjust_volume(slider: HSlider, delta: float):
	if slider:
		slider.value = clamp(slider.value + delta, 0.0, 1.0)

func _update_volume_label(label: Label, value: float):
	if label:
		label.text = str(int(value * 100)) + "%"

func _on_master_volume_changed(value: float):
	var bus_idx = AudioServer.get_bus_index("Master")
	if bus_idx != -1:
		AudioServer.set_bus_volume_db(bus_idx, linear_to_db(value))
		_update_volume_label(master_label, value)
		_save_audio_settings()

func _on_music_volume_changed(value: float):
	var bus_idx = AudioServer.get_bus_index("Music")
	if bus_idx != -1:
		AudioServer.set_bus_volume_db(bus_idx, linear_to_db(value))
		_update_volume_label(music_label, value)
		_save_audio_settings()

func _on_sfx_volume_changed(value: float):
	var bus_idx = AudioServer.get_bus_index("SFX")
	if bus_idx != -1:
		AudioServer.set_bus_volume_db(bus_idx, linear_to_db(value))
		_update_volume_label(sfx_label, value)
		_save_audio_settings()

func _save_audio_settings():
	# Save audio settings to user preferences
	var config = ConfigFile.new()
	config.set_value("audio", "master_volume", master_slider.value if master_slider else 1.0)
	config.set_value("audio", "music_volume", music_slider.value if music_slider else 1.0)
	config.set_value("audio", "sfx_volume", sfx_slider.value if sfx_slider else 1.0)
	config.save("user://settings.cfg")

func _on_save_game():
	if save_manager and save_manager.has_method("save_game"):
		save_manager.save_game()
		_show_notification("Game Saved!")
	else:
		print("SaveManager not available")

func _on_load_game():
	if save_manager and save_manager.has_method("load_game"):
		save_manager.load_game()
		_show_notification("Game Loaded!")
		# Close settings after loading
		_on_close_pressed()
	else:
		print("SaveManager not available")

func _on_clear_data():
	# Show confirmation dialog
	_show_confirmation("Clear all game data?", _clear_data_confirmed)

func _clear_data_confirmed():
	if save_manager and save_manager.has_method("clear_all_data"):
		save_manager.clear_all_data()
		_show_notification("Data Cleared!")
	else:
		# Manual clear
		DirAccess.remove_absolute("user://savegame.dat")
		DirAccess.remove_absolute("user://settings.cfg")
		_show_notification("Data Cleared!")

func _on_backup_data():
	if save_manager and save_manager.has_method("backup_save"):
		save_manager.backup_save()
		_show_notification("Backup Created!")
	else:
		# Manual backup
		var save_data = FileAccess.get_file_as_bytes("user://savegame.dat")
		if save_data:
			var backup_file = FileAccess.open("user://savegame_backup.dat", FileAccess.WRITE)
			backup_file.store_buffer(save_data)
			backup_file.close()
			_show_notification("Backup Created!")

func _on_restore_data():
	_show_confirmation("Restore from backup?", _restore_data_confirmed)

func _restore_data_confirmed():
	if save_manager and save_manager.has_method("restore_backup"):
		save_manager.restore_backup()
		_show_notification("Backup Restored!")
		_on_close_pressed()
	else:
		# Manual restore
		var backup_data = FileAccess.get_file_as_bytes("user://savegame_backup.dat")
		if backup_data:
			var save_file = FileAccess.open("user://savegame.dat", FileAccess.WRITE)
			save_file.store_buffer(backup_data)
			save_file.close()
			_show_notification("Backup Restored!")

func _on_fullscreen_toggled(enabled: bool):
	if enabled:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)

func _on_vsync_toggled(enabled: bool):
	if enabled:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED)
	else:
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)

func _show_notification(text: String):
	# Create a simple notification popup
	var notif = Label.new()
	notif.text = text
	notif.add_theme_color_override("font_color", Color.GREEN)
	notif.add_theme_font_size_override("font_size", 20)
	notif.position = Vector2(get_viewport_rect().size.x / 2 - 100, 100)
	add_child(notif)
	
	var tween = create_tween()
	tween.tween_property(notif, "modulate:a", 0.0, 2.0).set_delay(1.0)
	tween.tween_callback(notif.queue_free)

func _show_confirmation(text: String, callback: Callable):
	# Create confirmation dialog
	var dialog = AcceptDialog.new()
	dialog.dialog_text = text
	dialog.title = "Confirm"
	dialog.add_cancel_button("Cancel")
	dialog.confirmed.connect(callback)
	dialog.canceled.connect(dialog.queue_free)
	add_child(dialog)
	dialog.popup_centered()

func _on_close_pressed():
	close_settings()

func close_settings():
	# Save settings before closing
	_save_audio_settings()
	
	# Restore pause state
	get_tree().paused = original_pause_state
	
	# Emit signal and clean up
	settings_closed.emit()
	queue_free()

func _input(event):
	# Handle ESC key
	if event.is_action_pressed("ui_cancel"):
		_on_close_pressed()
		get_viewport().set_input_as_handled()

func _unhandled_input(event):
	# Capture all input to prevent it from going to the game
	if event is InputEventMouse or event is InputEventKey:
		get_viewport().set_input_as_handled()

func _on_background_input(event):
	# Consume all background clicks
	if event is InputEventMouseButton:
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