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
var player_ref: Node

func _ready():
	# Ensure high priority for input
	z_index = 1000
	process_mode = Node.PROCESS_MODE_WHEN_PAUSED
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Pause the game
	original_pause_state = get_tree().paused
	get_tree().paused = true
	
	# Get references
	save_manager = get_node_or_null("/root/SaveManager")
	player_ref = get_node_or_null("/root/Player")
	
	# Setup UI
	_setup_ui()
	
	# Load settings from player data
	_load_settings()
	
	# Ensure we can receive input
	set_process_unhandled_input(true)
	grab_focus()
	
	# Make the background block input
	if has_node("Background"):
		var bg = $Background
		bg.mouse_filter = Control.MOUSE_FILTER_STOP
		bg.gui_input.connect(_on_background_input)
	
	# Add opening animation
	_animate_opening()

func _setup_ui():
	# Connect close button with better responsiveness
	if close_button:
		close_button.pressed.connect(_on_close_pressed)
		close_button.mouse_entered.connect(_on_close_button_hover)
		close_button.mouse_exited.connect(_on_close_button_exit)
		close_button.button_down.connect(_on_close_button_down)
		close_button.button_up.connect(_on_close_button_up)
		
		# Make the close button more user-friendly
		close_button.pivot_offset = close_button.size / 2
		close_button.mouse_filter = Control.MOUSE_FILTER_STOP
		close_button.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
		
		# Add larger hit area by creating an invisible background
		_enhance_close_button_hitarea()
	
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
	
	# Style the tabs
	_setup_tab_styling()

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

func _setup_tab_styling():
	# Style the tab container and individual tabs
	if not tab_container:
		return
	
	# Connect to tab changed signal for dynamic styling
	tab_container.tab_changed.connect(_on_tab_changed)
	
	# Set initial tab styling
	_style_audio_tab()
	_style_game_tab()
	_style_display_tab()
	
	# Set custom tab names with icons
	tab_container.set_tab_title(0, "🔊 Audio")
	tab_container.set_tab_title(1, "💾 Game") 
	tab_container.set_tab_title(2, "🖥️ Display")

func _style_audio_tab():
	# Add visual enhancements to audio controls
	var audio_tab = $Panel/TabContainer/Audio/VBoxContainer
	if not audio_tab:
		return
	
	# Style volume sliders
	for child in audio_tab.get_children():
		if child.name.ends_with("Volume") and child is VBoxContainer:
			_style_volume_control(child)

func _style_volume_control(volume_control: VBoxContainer):
	# Add visual feedback to volume controls
	var hbox = volume_control.get_node_or_null("HBoxContainer")
	if not hbox:
		return
	
	var slider = hbox.get_node_or_null("VolumeSlider")
	var dec_button = hbox.get_node_or_null("DecreaseButton")
	var inc_button = hbox.get_node_or_null("IncreaseButton")
	
	# Style buttons
	if dec_button:
		_style_volume_button(dec_button, Color.ORANGE_RED)
	if inc_button:
		_style_volume_button(inc_button, Color.GREEN)
	
	# Add hover effects to slider
	if slider:
		slider.mouse_entered.connect(func(): _animate_slider_hover(slider, true))
		slider.mouse_exited.connect(func(): _animate_slider_hover(slider, false))

func _style_volume_button(button: Button, color: Color):
	# Style volume adjustment buttons
	button.add_theme_color_override("font_color", Color.WHITE)
	button.add_theme_color_override("font_hover_color", color)
	button.add_theme_font_size_override("font_size", 20)
	button.mouse_entered.connect(func(): _animate_button_hover(button, true))
	button.mouse_exited.connect(func(): _animate_button_hover(button, false))

func _style_game_tab():
	# Style game management buttons
	var game_tab = $Panel/TabContainer/Game/VBoxContainer
	if not game_tab:
		return
	
	# Style save/load buttons with green theme
	if save_button:
		_style_action_button(save_button, Color.GREEN, "💾")
	if load_button:
		_style_action_button(load_button, Color.BLUE, "📁")
	
	# Style data management buttons
	if backup_button:
		_style_action_button(backup_button, Color.ORANGE, "🔒")
	if restore_button:
		_style_action_button(restore_button, Color.PURPLE, "🔓")
	if clear_data_button:
		_style_action_button(clear_data_button, Color.RED, "🗑️")

func _style_display_tab():
	# Style display options
	var display_tab = $Panel/TabContainer/Display/VBoxContainer
	if not display_tab:
		return
	
	var fullscreen_check = display_tab.get_node_or_null("FullscreenCheck")
	var vsync_check = display_tab.get_node_or_null("VSyncCheck")
	
	if fullscreen_check:
		_style_checkbox(fullscreen_check, "🖥️")
	if vsync_check:
		_style_checkbox(vsync_check, "⚡")

func _style_action_button(button: Button, color: Color, icon: String):
	# Style action buttons with icons and colors
	button.text = icon + " " + button.text
	button.add_theme_color_override("font_hover_color", color)
	button.mouse_entered.connect(func(): _animate_button_hover(button, true))
	button.mouse_exited.connect(func(): _animate_button_hover(button, false))

func _style_checkbox(checkbox: CheckBox, icon: String):
	# Style checkboxes with icons
	checkbox.text = icon + " " + checkbox.text

func _animate_slider_hover(slider: HSlider, hovering: bool):
	var tween = create_tween()
	var target_modulate = Color(1.2, 1.2, 1.0, 1.0) if hovering else Color.WHITE
	tween.tween_property(slider, "modulate", target_modulate, 0.2)

func _animate_button_hover(button: Button, hovering: bool):
	var tween = create_tween()
	var target_scale = Vector2(1.05, 1.05) if hovering else Vector2(1.0, 1.0)
	tween.tween_property(button, "scale", target_scale, 0.1)

func _on_tab_changed(tab: int):
	# Add visual feedback when tabs change
	if not tab_container:
		return
	
	# Animate tab transition
	var current_tab_control = tab_container.get_tab_control(tab)
	if current_tab_control:
		current_tab_control.modulate.a = 0.0
		var tween = create_tween()
		tween.tween_property(current_tab_control, "modulate:a", 1.0, 0.3)

func _animate_opening():
	# Smooth opening animation
	if panel:
		panel.scale = Vector2(0.8, 0.8)
		panel.modulate.a = 0.0
		
		var tween = create_tween()
		tween.set_parallel(true)
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_BACK)
		
		tween.tween_property(panel, "scale", Vector2(1.0, 1.0), 0.4)
		tween.tween_property(panel, "modulate:a", 1.0, 0.3)
	
	# Animate background fade
	var bg = get_node_or_null("Background")
	if bg:
		bg.modulate.a = 0.0
		var bg_tween = create_tween()
		bg_tween.tween_property(bg, "modulate:a", 0.85, 0.3)

func _enhance_close_button_hitarea():
	# Create a larger invisible hit area for the close button
	if not close_button:
		return
	
	# Create an invisible button that covers a larger area
	var hit_area = Button.new()
	hit_area.name = "CloseButtonHitArea"
	hit_area.flat = true
	hit_area.modulate.a = 0.0  # Make it invisible
	hit_area.mouse_filter = Control.MOUSE_FILTER_STOP
	
	# Position it to cover a larger area around the close button
	hit_area.anchor_left = close_button.anchor_left
	hit_area.anchor_right = close_button.anchor_right
	hit_area.anchor_top = close_button.anchor_top
	hit_area.anchor_bottom = close_button.anchor_bottom
	hit_area.offset_left = close_button.offset_left - 10  # Extend 10 pixels in each direction
	hit_area.offset_top = close_button.offset_top - 10
	hit_area.offset_right = close_button.offset_right + 10
	hit_area.offset_bottom = close_button.offset_bottom + 10
	
	# Insert it before the close button so it doesn't block the visual
	close_button.get_parent().add_child(hit_area)
	close_button.get_parent().move_child(hit_area, close_button.get_index())
	
	# Connect the larger hit area to trigger close button events
	hit_area.pressed.connect(_on_close_pressed)
	hit_area.mouse_entered.connect(_on_close_button_hover)
	hit_area.mouse_exited.connect(_on_close_button_exit)
	hit_area.button_down.connect(_on_close_button_down)
	hit_area.button_up.connect(_on_close_button_up)

func _load_settings():
	# Load audio settings from player data
	if not player_ref:
		print("Settings: Player reference not found")
		return
	
	# Get volumes from player data
	var master_volume = player_ref.get_volume("master")
	var music_volume = player_ref.get_volume("music")
	var sfx_volume = player_ref.get_volume("sfx")
	
	# Update UI sliders
	if master_slider:
		master_slider.value = master_volume
		_update_volume_label(master_label, master_volume)
	
	if music_slider:
		music_slider.value = music_volume
		_update_volume_label(music_label, music_volume)
	
	if sfx_slider:
		sfx_slider.value = sfx_volume
		_update_volume_label(sfx_label, sfx_volume)

func _adjust_volume(slider: HSlider, delta: float):
	if slider:
		slider.value = clamp(slider.value + delta, 0.0, 1.0)

func _update_volume_label(label: Label, value: float):
	if label:
		label.text = str(int(value * 100)) + "%"

func _on_master_volume_changed(value: float):
	if player_ref:
		player_ref.update_volume("master", value)
		_update_volume_label(master_label, value)

func _on_music_volume_changed(value: float):
	if player_ref:
		player_ref.update_volume("music", value)
		_update_volume_label(music_label, value)

func _on_sfx_volume_changed(value: float):
	if player_ref:
		player_ref.update_volume("sfx", value)
		_update_volume_label(sfx_label, value)

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
		# Add a slight glow effect by modulating the color
		close_button.modulate = Color(1.3, 1.3, 1.3, 1.0)
		
		var tween = create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_ELASTIC)
		tween.tween_property(close_button, "scale", Vector2(1.3, 1.3), 0.3)

func _on_close_button_exit():
	if close_button:
		# Reset the glow effect
		close_button.modulate = Color.WHITE
		
		var tween = create_tween()
		tween.set_parallel(true)
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_CUBIC)
		tween.tween_property(close_button, "scale", Vector2(1.0, 1.0), 0.2)

func _on_close_button_down():
	if close_button:
		var tween = create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_SINE)
		tween.tween_property(close_button, "scale", Vector2(0.9, 0.9), 0.1)

func _on_close_button_up():
	if close_button:
		var tween = create_tween()
		tween.set_ease(Tween.EASE_OUT)
		tween.set_trans(Tween.TRANS_BACK)
		tween.tween_property(close_button, "scale", Vector2(1.2, 1.2), 0.15)