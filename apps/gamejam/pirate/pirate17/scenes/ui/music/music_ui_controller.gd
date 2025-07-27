class_name MusicUIController
extends Control

@onready var track_name_label: Label = $MusicPlayerPanel/MainContainer/TrackInfo/TrackNameLabel
@onready var track_index_label: Label = $MusicPlayerPanel/MainContainer/TrackInfo/TrackIndexLabel
@onready var prev_button: Button = $MusicPlayerPanel/MainContainer/Controls/PrevButton
@onready var play_pause_button: Button = $MusicPlayerPanel/MainContainer/Controls/PlayPauseButton
@onready var next_button: Button = $MusicPlayerPanel/MainContainer/Controls/NextButton
@onready var volume_slider: HSlider = $MusicPlayerPanel/MainContainer/VolumeContainer/VolumeSlider
@onready var volume_percent: Label = $MusicPlayerPanel/MainContainer/VolumeContainer/VolumePercent

var music_player: MusicPlayer

func _ready():
	# Get reference to the music player autoload
	music_player = get_node("/root/MusicPlayerAutoload")
	
	if not music_player:
		print("MusicUIController: Could not find MusicPlayerAutoload")
		return
	
	setup_ui_connections()
	update_ui_from_player()

func setup_ui_connections():
	# Connect button signals
	if prev_button:
		prev_button.pressed.connect(_on_prev_pressed)
	if play_pause_button:
		play_pause_button.pressed.connect(_on_play_pause_pressed)
	if next_button:
		next_button.pressed.connect(_on_next_pressed)
	if volume_slider:
		volume_slider.value_changed.connect(_on_volume_changed)
	
	# Connect to music player signals
	if music_player:
		music_player.track_changed.connect(_on_track_changed)
		music_player.volume_changed.connect(_on_volume_changed_from_player)

func update_ui_from_player():
	if not music_player:
		return
		
	# Update track info
	update_track_display()
	
	# Update volume
	if volume_slider:
		volume_slider.value = music_player.master_volume
	update_volume_display(music_player.master_volume)
	
	# Update play/pause button
	update_play_pause_button()

func update_track_display():
	if not music_player:
		return
		
	var track_name = music_player.get_current_track_name()
	var track_count = music_player.get_track_count()
	var current_index = music_player.current_track
	
	if track_name_label:
		track_name_label.text = track_name
	
	if track_index_label:
		track_index_label.text = "Track " + str(current_index + 1) + " of " + str(track_count)

func update_play_pause_button():
	if not music_player or not play_pause_button:
		return
		
	if music_player.is_playing():
		play_pause_button.text = "⏸"  # Pause symbol
	else:
		play_pause_button.text = "▶"  # Play symbol

func update_volume_display(volume: float):
	if volume_percent:
		volume_percent.text = str(int(volume * 100)) + "%"

func _on_prev_pressed():
	if music_player:
		music_player.previous_track()

func _on_play_pause_pressed():
	if not music_player:
		return
		
	if music_player.is_playing():
		music_player.pause()
	else:
		music_player.resume()
	
	update_play_pause_button()

func _on_next_pressed():
	if music_player:
		music_player.next_track()

func _on_volume_changed(value: float):
	if music_player:
		music_player.master_volume = value

func _on_track_changed(track_index: int, track_name: String):
	update_track_display()
	update_play_pause_button()

func _on_volume_changed_from_player(volume: float):
	if volume_slider and volume_slider.value != volume:
		volume_slider.value = volume
	update_volume_display(volume)

func show_music_ui():
	visible = true

func hide_music_ui():
	visible = false

func toggle_music_ui():
	visible = not visible