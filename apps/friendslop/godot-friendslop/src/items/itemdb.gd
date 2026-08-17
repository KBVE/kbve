class_name Itemdb
extends RefCounted


const PATH := "res://assets/itemdb/itemdb.json"

static var _entries: Dictionary = {}
static var _loaded := false


static func all() -> Dictionary:
	if not _loaded:
		_load()
	return _entries


static func item(ref: StringName) -> Dictionary:
	return all().get(ref, {})


static func has(ref: StringName) -> bool:
	return all().has(ref)


static func display_name(ref: StringName) -> String:
	return str(item(ref).get("name", ref))


static func grid_size(ref: StringName) -> Vector2i:
	var grid: Dictionary = item(ref).get("grid", {})
	return Vector2i(maxi(int(grid.get("width", 1)), 1), maxi(int(grid.get("height", 1)), 1))


static func max_stack(ref: StringName) -> int:
	var entry := item(ref)
	if not bool(entry.get("stackable", false)):
		return 1
	return maxi(int(entry.get("max_stack", 1)), 1)


static func slot_of(ref: StringName) -> StringName:
	var equipment: Dictionary = item(ref).get("equipment", {})
	return StringName(equipment.get("slot", ""))


static func wardrobe_piece(ref: StringName, sex := "Male") -> StringName:
	var equipment: Dictionary = item(ref).get("equipment", {})
	var look := str(equipment.get("wardrobe", ""))
	if look == "":
		return &""
	var id := StringName("%s_%s" % [sex.to_lower(), look])
	if Wardrobe.has(id):
		return id
	var bits := look.split("_", false)
	if bits.size() < 2:
		return &""
	return Wardrobe.match_piece(sex, bits[0], bits[1])


static func wearables() -> Array[StringName]:
	var out: Array[StringName] = []
	for ref: StringName in all():
		if str(item(ref).get("equipment", {}).get("wardrobe", "")) != "":
			out.append(ref)
	out.sort()
	return out


static func _load() -> void:
	_loaded = true
	var raw: Variant = _read()
	if raw is not Dictionary:
		push_warning("itemdb: nothing readable at %s" % PATH)
		return
	var entries: Variant = (raw as Dictionary).get("entries", [])
	if entries is not Array:
		return
	for row: Variant in entries:
		if row is Dictionary and row.has("ref"):
			_entries[StringName(row["ref"])] = row


static func _read() -> Variant:
	if ResourceLoader.exists(PATH):
		var res: Variant = ResourceLoader.load(PATH)
		if res is JSON:
			return (res as JSON).data
	if not FileAccess.file_exists(PATH):
		return null
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(PATH)) != OK:
		push_warning("itemdb: %s is not valid JSON (%s)" % [PATH, json.get_error_message()])
		return null
	return json.data
