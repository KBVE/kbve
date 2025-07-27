class_name MusicPlayer
extends Node

signal track_changed(track_index: int, track_name: String)
signal volume_changed(volume: float)

@export var current_track: int = 0 : set = set_current_track
@export_range(0.0, 1.0) var master_volume: float = 0.7 : set = set_master_volume
@export var auto_play: bool = true
@export var crossfade_duration: float = 2.0

var audio_player: AudioStreamPlayer
var fade_player: AudioStreamPlayer  # For crossfading
var is_crossfading: bool = false

# Track list with their file paths
var tracks: Array[Dictionary] = [
	{
		"name": "Morning Walk",
		"path": "res://scenes/ui/music/Morning Walk.ogg",
		"index": 0
	},
	{
		"name": "Evening Mood", 
		"path": "res://scenes/ui/music/Evening Mood.ogg",
		"index": 1
	},
	{
		"name": "Homework",
		"path": "res://scenes/ui/music/Homework.ogg", 
		"index": 2
	},
	{
		"name": "After",
		"path": "res://scenes/ui/music/After.ogg",
		"index": 3
	},
	{
		"name": "420",
		"path": "res://scenes/ui/music/420.ogg",
		"index": 4
	}
]

func _ready():
	# Set process mode to always so music continues when game is paused
	process_mode = Node.PROCESS_MODE_ALWAYS
	
	# Create main audio player
	audio_player = AudioStreamPlayer.new()
	audio_player.name = "MainAudioPlayer"
	audio_player.bus = "Music"
	audio_player.volume_db = linear_to_db(master_volume)
	audio_player.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(audio_player)
	
	# Create fade audio player for crossfading
	fade_player = AudioStreamPlayer.new()
	fade_player.name = "FadeAudioPlayer"
	fade_player.bus = "Music"
	fade_player.volume_db = linear_to_db(0.0)
	fade_player.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(fade_player)
	
	# Connect finished signal for looping
	audio_player.finished.connect(_on_track_finished)
	fade_player.finished.connect(_on_fade_track_finished)
	
	# Start playing if auto_play is enabled
	if auto_play:
		play_track(current_track)

func set_current_track(value: int):
	if value < 0 or value >= tracks.size():
		push_warning("Invalid track index: " + str(value))
		return
		
	if current_track == value and audio_player and audio_player.playing:
		return  # Already playing this track
		
	current_track = value
	play_track(current_track)

func set_master_volume(value: float):
	master_volume = clamp(value, 0.0, 1.0)
	if audio_player:
		audio_player.volume_db = linear_to_db(master_volume)
	if fade_player and not is_crossfading:
		fade_player.volume_db = linear_to_db(0.0)
	volume_changed.emit(master_volume)

func play_track(index: int):
	if index < 0 or index >= tracks.size():
		push_warning("Invalid track index: " + str(index))
		return
		
	var track_data = tracks[index]
	var stream = load(track_data["path"])
	
	if not stream:
		push_error("Failed to load track: " + track_data["path"])
		return
	
	# If a track is already playing, crossfade to the new one
	if audio_player and audio_player.playing and crossfade_duration > 0:
		_crossfade_to_track(stream, track_data)
	else:
		# Direct play
		if audio_player:
			audio_player.stream = stream
			audio_player.play()
			track_changed.emit(index, track_data["name"])
			print("Now playing: " + track_data["name"])

func _crossfade_to_track(new_stream: AudioStream, track_data: Dictionary):
	if is_crossfading:
		return  # Already crossfading
		
	is_crossfading = true
	
	# Set up the fade player with the new track
	fade_player.stream = new_stream
	fade_player.volume_db = linear_to_db(0.0)
	fade_player.play()
	
	# Create tween for crossfade
	var tween = create_tween()
	tween.set_parallel(true)
	
	# Fade out current track
	tween.tween_property(audio_player, "volume_db", linear_to_db(0.0), crossfade_duration)
	
	# Fade in new track
	tween.tween_property(fade_player, "volume_db", linear_to_db(master_volume), crossfade_duration)
	
	# Swap players after crossfade
	tween.set_parallel(false)
	tween.tween_callback(_complete_crossfade.bind(track_data))

func _complete_crossfade(track_data: Dictionary):
	# Swap the players
	var temp = audio_player
	audio_player = fade_player
	fade_player = temp
	
	# Stop the old player
	fade_player.stop()
	fade_player.volume_db = linear_to_db(0.0)
	
	is_crossfading = false
	track_changed.emit(track_data["index"], track_data["name"])
	print("Crossfaded to: " + track_data["name"])

func _on_track_finished():
	# Loop the current track
	if current_track >= 0 and current_track < tracks.size() and audio_player:
		audio_player.play()

func _on_fade_track_finished():
	# Loop the fade track if it's the active one during crossfade
	if is_crossfading and fade_player:
		fade_player.play()

func stop():
	if audio_player:
		audio_player.stop()
	if fade_player:
		fade_player.stop()
	is_crossfading = false

func pause():
	if audio_player:
		audio_player.stream_paused = true
	if is_crossfading and fade_player:
		fade_player.stream_paused = true

func resume():
	if audio_player:
		audio_player.stream_paused = false
	if is_crossfading and fade_player:
		fade_player.stream_paused = false

func is_playing() -> bool:
	var main_playing = audio_player and audio_player.playing
	var fade_playing = fade_player and fade_player.playing
	return main_playing or fade_playing

func get_current_track_name() -> String:
	if current_track >= 0 and current_track < tracks.size():
		return tracks[current_track]["name"]
	return ""

func get_track_count() -> int:
	return tracks.size()

func get_track_name(index: int) -> String:
	if index >= 0 and index < tracks.size():
		return tracks[index]["name"]
	return ""

func next_track():
	var next_index = (current_track + 1) % tracks.size()
	set_current_track(next_index)

func previous_track():
	var prev_index = current_track - 1
	if prev_index < 0:
		prev_index = tracks.size() - 1
	set_current_track(prev_index)

func get_playback_position() -> float:
	if audio_player:
		return audio_player.get_playback_position()
	return 0.0

func get_track_length() -> float:
	if audio_player and audio_player.stream:
		return audio_player.stream.get_length()
	return 0.0

# Global helper functions for easy access from anywhere
func change_music_by_state(state: int):
	"""
	Change music based on game state integer.
	State 0 = Morning Walk (default)
	State 1 = Evening Mood
	State 2 = Homework  
	State 3 = After
	State 4 = 420
	"""
	set_current_track(state)

func get_current_state() -> int:
	"""Returns the current track as a state integer"""
	return current_track

# Global access helper - call this from anywhere
# Example: MusicPlayerAutoload.change_music_by_state(1)
# or from any script: get_node("/root/MusicPlayerAutoload").change_music_by_state(2)
