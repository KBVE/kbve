class_name PlayerSaving
extends RefCounted

## Robust player save/load system with JSON validation and corruption protection
## Handles saving player data to JSON files with backup and integrity checks
## Trying to make sure that the json is saved locally but we could setup an online save too?
### TODO: Supabase Player Saving.

const SAVE_FILE_PATH = "user://player_save.json"
const BACKUP_FILE_PATH = "user://player_save_backup.json"
const TEMP_FILE_PATH = "user://player_save_temp.json"

### TODO: Dexie Support for Saving.
# Save file version for future compatibility - references global game version
const SAVE_VERSION = Global.GAME_VERSION

### TODO: Supabase Integrity Hash Function -> via Edge.
# Data integrity hash for corruption detection
const INTEGRITY_KEY = "pirate17_save_integrity"

enum SaveResult {
	SUCCESS,
	WRITE_ERROR,
	VALIDATION_ERROR,
	PERMISSION_ERROR
}

enum LoadResult {
	SUCCESS,
	FILE_NOT_FOUND,
	CORRUPTED_DATA,
	INVALID_FORMAT,
	VERSION_MISMATCH
}

## Save player data to JSON with corruption protection v0.
## NOTE: I am not too sure how bad the player saving corruption is for godot, but better to be safe.
## Think of saving as a loop where we keep the original just in case something goes wrong.
static func save_player_data(player_data: Dictionary) -> SaveResult:
	print("PlayerSaving: Starting save process...")
	
	# Validate input data first
	if not _validate_player_data(player_data):
		print("PlayerSaving: ERROR - Invalid player data structure")
		return SaveResult.VALIDATION_ERROR
	
	# Create save data structure with metadata
	var save_data = {
		"version": SAVE_VERSION,
		"game_version": Global.GAME_VERSION,
		"timestamp": Time.get_unix_time_from_system(),
		"integrity_hash": "",
		"player_data": player_data
	}
	
	# Generate integrity hash
	save_data.integrity_hash = _generate_integrity_hash(player_data)
	
	# Convert to JSON
	var json_string = JSON.stringify(save_data, "\t")
	if json_string == "":
		print("PlayerSaving: ERROR - Failed to serialize data to JSON")
		return SaveResult.VALIDATION_ERROR
	
	# Save with atomic write (temp file -> main file)
	var result = _atomic_save(json_string)
	if result == SaveResult.SUCCESS:
		# Create backup after successful save
		_create_backup()
		print("PlayerSaving: Save completed successfully")
	
	return result

## Load player data from JSON with corruption detection
static func load_player_data() -> Dictionary:
	print("PlayerSaving: Starting load process...")
	
	var result = _attempt_load_from_file(SAVE_FILE_PATH)
	
	# If main file failed, try backup
	if result.load_result != LoadResult.SUCCESS:
		print("PlayerSaving: Main save failed, trying backup...")
		result = _attempt_load_from_file(BACKUP_FILE_PATH)
	
	# If both failed, return default data
	if result.load_result != LoadResult.SUCCESS:
		print("PlayerSaving: No valid save found, using default data")
		return _get_default_player_data()
	
	print("PlayerSaving: Load completed successfully")
	return result.data

## Check if save file exists, which is what the title screen references.
### TODO: Sync save to postgres via edge functions.
static func save_exists() -> bool:
	return FileAccess.file_exists(SAVE_FILE_PATH) or FileAccess.file_exists(BACKUP_FILE_PATH)

## Delete save files (for new game or reset)
static func delete_save_files() -> bool:
	var success = true
	
	if FileAccess.file_exists(SAVE_FILE_PATH):
		var error = DirAccess.remove_absolute(SAVE_FILE_PATH)
		if error != OK:
			print("PlayerSaving: WARNING - Failed to delete main save file")
			success = false
	
	if FileAccess.file_exists(BACKUP_FILE_PATH):
		var error = DirAccess.remove_absolute(BACKUP_FILE_PATH)
		if error != OK:
			print("PlayerSaving: WARNING - Failed to delete backup save file")
			success = false
	
	if FileAccess.file_exists(TEMP_FILE_PATH):
		DirAccess.remove_absolute(TEMP_FILE_PATH)  # Clean up temp file
	
	print("PlayerSaving: Save files deleted: ", success)
	return success

## Get save file info for debugging
static func get_save_info() -> Dictionary:
	var info = {
		"main_exists": FileAccess.file_exists(SAVE_FILE_PATH),
		"backup_exists": FileAccess.file_exists(BACKUP_FILE_PATH),
		"main_size": 0,
		"backup_size": 0,
		"main_modified": 0,
		"backup_modified": 0
	}
	
	if info.main_exists:
		var file = FileAccess.open(SAVE_FILE_PATH, FileAccess.READ)
		if file:
			info.main_size = file.get_length()
			file.close()
		info.main_modified = FileAccess.get_modified_time(SAVE_FILE_PATH)
	
	if info.backup_exists:
		var file = FileAccess.open(BACKUP_FILE_PATH, FileAccess.READ)
		if file:
			info.backup_size = file.get_length()
			file.close()
		info.backup_modified = FileAccess.get_modified_time(BACKUP_FILE_PATH)
	
	return info

# PRIVATE METHODS

static func _validate_player_data(data: Dictionary) -> bool:
	"""Validate that player data has required structure"""
	# Check for required top-level keys
	var required_keys = ["player_name", "player_ulid", "stats", "position"]
	
	for key in required_keys:
		if not data.has(key):
			print("PlayerSaving: Missing required key: ", key)
			return false
	
	# Validate stats structure
	if not data.stats is Dictionary:
		print("PlayerSaving: Stats is not a dictionary")
		return false
	
	var stats_keys = ["health", "max_health", "energy", "max_energy"]
	for key in stats_keys:
		if not data.stats.has(key):
			print("PlayerSaving: Missing stats key: ", key)
			return false
		if not (data.stats[key] is int or data.stats[key] is float):
			print("PlayerSaving: Invalid stats value type for: ", key)
			return false
	
	# Validate position structure
	if not data.position is Dictionary:
		print("PlayerSaving: Position is not a dictionary")
		return false
	
	if not (data.position.has("x") and data.position.has("y")):
		print("PlayerSaving: Position missing x or y coordinates")
		return false
	
	return true

static func _generate_integrity_hash(data: Dictionary) -> String:
	"""Generate hash for data integrity verification"""
	var data_string = JSON.stringify(data)
	var hash_input = INTEGRITY_KEY + data_string + str(data_string.length())
	return hash_input.sha256_text()

static func _verify_integrity(save_data: Dictionary) -> bool:
	"""Verify data integrity using hash"""
	if not save_data.has("integrity_hash") or not save_data.has("player_data"):
		return false
	
	var expected_hash = _generate_integrity_hash(save_data.player_data)
	return save_data.integrity_hash == expected_hash

static func _atomic_save(json_string: String) -> SaveResult:
	"""Atomic save using temporary file"""
	# Write to temporary file first
	var temp_file = FileAccess.open(TEMP_FILE_PATH, FileAccess.WRITE)
	if not temp_file:
		print("PlayerSaving: ERROR - Cannot create temp file")
		return SaveResult.PERMISSION_ERROR
	
	temp_file.store_string(json_string)
	temp_file.close()
	
	# Verify temp file was written correctly
	var verify_file = FileAccess.open(TEMP_FILE_PATH, FileAccess.READ)
	if not verify_file:
		print("PlayerSaving: ERROR - Cannot verify temp file")
		return SaveResult.WRITE_ERROR
	
	var written_content = verify_file.get_as_text()
	verify_file.close()
	
	if written_content != json_string:
		print("PlayerSaving: ERROR - Temp file content mismatch")
		DirAccess.remove_absolute(TEMP_FILE_PATH)
		return SaveResult.WRITE_ERROR
	
	# Move temp file to main save file
	var error = DirAccess.rename_absolute(TEMP_FILE_PATH, SAVE_FILE_PATH)
	if error != OK:
		print("PlayerSaving: ERROR - Cannot move temp file to save file: ", error)
		DirAccess.remove_absolute(TEMP_FILE_PATH)
		return SaveResult.WRITE_ERROR
	
	return SaveResult.SUCCESS

static func _create_backup():
	"""Create backup of current save file"""
	if FileAccess.file_exists(SAVE_FILE_PATH):
		var error = DirAccess.copy_absolute(SAVE_FILE_PATH, BACKUP_FILE_PATH)
		if error != OK:
			print("PlayerSaving: WARNING - Failed to create backup: ", error)
		else:
			print("PlayerSaving: Backup created successfully")

static func _attempt_load_from_file(file_path: String) -> Dictionary:
	"""Attempt to load and validate data from a specific file"""
	var result = {
		"load_result": LoadResult.FILE_NOT_FOUND,
		"data": {}
	}
	
	if not FileAccess.file_exists(file_path):
		return result
	
	var file = FileAccess.open(file_path, FileAccess.READ)
	if not file:
		print("PlayerSaving: ERROR - Cannot open file: ", file_path)
		result.load_result = LoadResult.CORRUPTED_DATA
		return result
	
	var json_string = file.get_as_text()
	file.close()
	
	if json_string == "":
		print("PlayerSaving: ERROR - Empty file: ", file_path)
		result.load_result = LoadResult.CORRUPTED_DATA
		return result
	
	# Parse JSON
	var json = JSON.new()
	var parse_result = json.parse(json_string)
	if parse_result != OK:
		print("PlayerSaving: ERROR - Invalid JSON in file: ", file_path)
		result.load_result = LoadResult.INVALID_FORMAT
		return result
	
	var save_data = json.data
	if not save_data is Dictionary:
		print("PlayerSaving: ERROR - JSON is not a dictionary")
		result.load_result = LoadResult.INVALID_FORMAT
		return result
	
	# Check version compatibility
	if not save_data.has("version"):
		print("PlayerSaving: WARNING - No version info in save file")
	elif save_data.version != SAVE_VERSION:
		print("PlayerSaving: WARNING - Version mismatch. File: ", save_data.version, " Expected: ", SAVE_VERSION)
		# Could implement version migration here
	
	# Log game version information for debugging
	if save_data.has("game_version"):
		print("PlayerSaving: Save file game version: ", save_data.game_version)
		if save_data.game_version != Global.GAME_VERSION:
			print("PlayerSaving: WARNING - Game version mismatch. File: ", save_data.game_version, " Current: ", Global.GAME_VERSION)
	else:
		print("PlayerSaving: WARNING - No game version info in save file")
	
	# Verify data integrity
	if not _verify_integrity(save_data):
		print("PlayerSaving: ERROR - Data integrity check failed")
		result.load_result = LoadResult.CORRUPTED_DATA
		return result
	
	# Validate player data structure
	if not _validate_player_data(save_data.player_data):
		print("PlayerSaving: ERROR - Invalid player data structure")
		result.load_result = LoadResult.CORRUPTED_DATA
		return result
	
	result.load_result = LoadResult.SUCCESS
	result.data = save_data.player_data
	return result

static func _get_default_player_data() -> Dictionary:
	"""Return default player data structure"""
	return {
		"player_name": "New Captain",
		"player_ulid": "DEFAULT_" + str(Time.get_unix_time_from_system()),
		"stats": {
			"health": 100,
			"max_health": 100,
			"energy": 75,
			"max_energy": 75
		},
		"position": {
			"x": 50,
			"y": 50
		},
		"created_at": Time.get_unix_time_from_system(),
		"play_time": 0.0
	}