extends Node

const ULIDGenerator = preload("res://scripts/utils/ulid.gd")
const PlayerSaving = preload("res://scripts/player/player_saving.gd")

var player_ulid: String = ""
var player_name: String = ""
var stats: Stats
var inventory: Inventory
var current_position: Vector2i = Vector2i(50, 50)
var play_time: float = 0.0
var created_at: float = 0.0

# Audio settings
var audio_settings: Dictionary = {
	"master_volume": 0.2,  # Default 20%
	"music_volume": 1.0,   # Default 100%
	"sfx_volume": 1.0      # Default 100%
}

func _ready():
	if PlayerSaving.save_exists():
		load_player_data()
	else:
		initialize_new_player()

func initialize_new_player():
	"""Initialize a new player with default values"""
	if player_ulid.is_empty():
		player_ulid = ULIDGenerator.generate()
	
	if player_name.is_empty():
		player_name = "Captain Anon" + str(randi_range(1000, 9999))
	
	stats = Stats.new()
	inventory = Inventory.new()
	add_child(inventory)
	
	created_at = Time.get_unix_time_from_system()
	play_time = 0.0
	current_position = Vector2i(50, 50)
	
	give_starting_items()
	
	# Apply default audio settings
	apply_audio_settings()
	
	save_player_data()
	
	print("New player initialized: ", player_name, " (", player_ulid, ")")

func give_starting_items():
	inventory.add_item_by_id("gold_coin", 25)
	inventory.add_item_by_id("health_potion", 5) 
	inventory.add_item_by_id("mana_potion", 3)
	inventory.add_item_by_id("bread", 10)
	inventory.add_item_by_id("apple", 8)
	inventory.add_item_by_id("treasure_map", 1)
	
	print("Player received starting items from ItemDatabase!")
	inventory.print_inventory()

func save_player_data() -> bool:
	"""Save current player state to JSON file"""
	var player_data = serialize_player_data()
	var result = PlayerSaving.save_player_data(player_data)
	
	if result == PlayerSaving.SaveResult.SUCCESS:
		print("Player data saved successfully")
		return true
	else:
		print("Failed to save player data: ", PlayerSaving.SaveResult.keys()[result])
		return false

func load_player_data() -> bool:
	"""Load player state from JSON file"""
	var player_data = PlayerSaving.load_player_data()
	
	if player_data.is_empty():
		print("No player data found, initializing new player")
		initialize_new_player()
		return false
	
	deserialize_player_data(player_data)
	print("Player data loaded successfully: ", player_name, " (", player_ulid, ")")
	return true

func serialize_player_data() -> Dictionary:
	"""Convert current player state to dictionary for saving"""
	var data = {
		"player_name": player_name,
		"player_ulid": player_ulid,
		"stats": {
			"health": stats.health,
			"max_health": stats.max_health,
			"mana": stats.mana,
			"max_mana": stats.max_mana,
			"energy": stats.energy,
			"max_energy": stats.max_energy,
			"base_attack": stats.base_attack,
			"base_defense": stats.base_defense
		},
		"position": {
			"x": current_position.x,
			"y": current_position.y
		},
		"play_time": play_time,
		"created_at": created_at,
		"audio_settings": audio_settings
	}
	
	if inventory and inventory.has_method("serialize"):
		data.inventory = inventory.serialize()
	
	return data

func deserialize_player_data(data: Dictionary):
	"""Restore player state from loaded dictionary"""
	player_name = data.get("player_name", "Unknown Captain")
	player_ulid = data.get("player_ulid", ULID.generate())
	play_time = data.get("play_time", 0.0)
	created_at = data.get("created_at", Time.get_unix_time_from_system())
	
	if data.has("position"):
		var pos_data = data.position
		current_position = Vector2i(pos_data.get("x", 50), pos_data.get("y", 50))
	
	if not stats:
		stats = Stats.new()
	
	if data.has("stats"):
		var stats_data = data.stats
		stats.max_health = stats_data.get("max_health", 100)
		stats.max_mana = stats_data.get("max_mana", 50)
		stats.max_energy = stats_data.get("max_energy", 75)
		stats.health = stats_data.get("health", stats.max_health)
		stats.mana = stats_data.get("mana", stats.max_mana)
		stats.energy = stats_data.get("energy", stats.max_energy)
		stats.base_attack = stats_data.get("base_attack", 10)
		stats.base_defense = stats_data.get("base_defense", 5)
	
	if not inventory:
		inventory = Inventory.new()
		add_child(inventory)
	
	if data.has("inventory") and inventory.has_method("deserialize"):
		inventory.deserialize(data.inventory)
	
	# Load audio settings
	if data.has("audio_settings"):
		audio_settings = data.audio_settings
		# Ensure defaults for any missing keys
		audio_settings.master_volume = audio_settings.get("master_volume", 0.2)
		audio_settings.music_volume = audio_settings.get("music_volume", 1.0)
		audio_settings.sfx_volume = audio_settings.get("sfx_volume", 1.0)
	
	# Apply audio settings to audio buses
	apply_audio_settings()

func update_position(new_position: Vector2i):
	"""Update player position and trigger auto-save"""
	current_position = new_position
	save_player_data()

func update_play_time(delta: float):
	"""Update total play time"""
	play_time += delta

func delete_save_data() -> bool:
	"""Delete save files and reset player"""
	var success = PlayerSaving.delete_save_files()
	if success:
		initialize_new_player()
	return success

func apply_audio_settings():
	"""Apply current audio settings to audio buses"""
	var master_bus = AudioServer.get_bus_index("Master")
	var music_bus = AudioServer.get_bus_index("Music")
	var sfx_bus = AudioServer.get_bus_index("SFX")
	
	if master_bus != -1:
		AudioServer.set_bus_volume_db(master_bus, linear_to_db(audio_settings.master_volume))
	
	if music_bus != -1:
		AudioServer.set_bus_volume_db(music_bus, linear_to_db(audio_settings.music_volume))
	
	if sfx_bus != -1:
		AudioServer.set_bus_volume_db(sfx_bus, linear_to_db(audio_settings.sfx_volume))
	
	print("Applied audio settings: Master=", int(audio_settings.master_volume * 100), "%, Music=", int(audio_settings.music_volume * 100), "%, SFX=", int(audio_settings.sfx_volume * 100), "%")

func update_volume(bus_name: String, volume: float):
	"""Update a specific volume setting and save"""
	bus_name = bus_name.to_lower()
	
	match bus_name:
		"master":
			audio_settings.master_volume = clamp(volume, 0.0, 1.0)
		"music":
			audio_settings.music_volume = clamp(volume, 0.0, 1.0)
		"sfx":
			audio_settings.sfx_volume = clamp(volume, 0.0, 1.0)
		_:
			print("Unknown audio bus: ", bus_name)
			return
	
	apply_audio_settings()
	save_player_data()

func get_volume(bus_name: String) -> float:
	"""Get current volume for a specific bus"""
	bus_name = bus_name.to_lower()
	
	match bus_name:
		"master":
			return audio_settings.master_volume
		"music":
			return audio_settings.music_volume
		"sfx":
			return audio_settings.sfx_volume
		_:
			print("Unknown audio bus: ", bus_name)
			return 1.0

func change_captain_name(new_name: String) -> bool:
	"""Change the captain's name and save immediately"""
	if new_name.strip_edges().is_empty():
		print("Cannot set empty captain name")
		return false
	
	var old_name = player_name
	player_name = new_name.strip_edges()
	
	if save_player_data():
		print("Captain name changed from '", old_name, "' to '", player_name, "'")
		return true
	else:
		player_name = old_name
		print("Failed to save captain name change")
		return false

func auto_save_on_interaction() -> bool:
	"""Triggered when opening interaction windows"""
	print("Auto-saving on interaction...")
	return save_player_data()

func get_save_info() -> Dictionary:
	"""Get information about save files"""
	return PlayerSaving.get_save_info()

func take_damage(damage: int):
	"""Take damage and update health"""
	print("🔥 PLAYER TAKE_DAMAGE CALLED! Damage: ", damage)
	print("🔥 Player node name: ", name)
	print("🔥 Player node type: ", get_class())
	
	if not stats:
		print("❌ WARNING: Player stats not initialized, cannot take damage")
		return
	
	print("DEBUG: Player taking ", damage, " damage")
	print("DEBUG: Health before: ", stats.health, "/", stats.max_health)
	
	stats.health = stats.health - damage
	
	print("DEBUG: Health after: ", stats.health, "/", stats.max_health)
	
	if stats.health <= 0:
		print("Player died!")
	
	save_player_data()

func _on_hitbox_area_entered(area: Area2D):
	"""Called when projectiles hit the player's hitbox"""
	print("🎯 PLAYER HITBOX HIT by area: ", area.name)
	
	var projectile = area.get_parent()
	if projectile and projectile.has_method("hit_entity"):
		print("🎯 Projectile found: ", projectile.name, " calling hit_entity")
		projectile.hit_entity(self)
	elif projectile and "damage" in projectile:
		print("🎯 Direct damage from: ", projectile.name, " damage: ", projectile.damage)
		take_damage(projectile.damage)
