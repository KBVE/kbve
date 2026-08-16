class_name Itemdb
extends RefCounted

## The item catalog, as the game reads it.
##
## Mirrored out of the same MDX the site is built from, so an item exists once and every
## consumer reads the same row. Only what the game asks about is exposed here: what an
## item is called, where it is worn, and what wearing it looks like.

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


## Where an item is worn, or nothing for one that is not worn at all.
static func slot_of(ref: StringName) -> StringName:
	var equipment: Dictionary = item(ref).get("equipment", {})
	return StringName(equipment.get("slot", ""))


## What wearing it looks like, resolved against the body wearing it: the catalog names
## `ranger_head_hood` and the wardrobe has one of those per sex, because the same hood is
## a different mesh on a different frame.
static func wardrobe_piece(ref: StringName, sex := "Male") -> StringName:
	var equipment: Dictionary = item(ref).get("equipment", {})
	var look := str(equipment.get("wardrobe", ""))
	if look == "":
		return &""
	var id := StringName("%s_%s" % [sex.to_lower(), look])
	if Wardrobe.has(id):
		return id
	## The pack does not name its two halves alike -- his boots are `Feet_Boots` and hers
	## are `Feet` -- so a miss falls back to the set and part the name describes.
	var bits := look.split("_", false)
	if bits.size() < 2:
		return &""
	return Wardrobe.match_piece(sex, bits[0], bits[1])


## Everything that can be worn, which is what a wardrobe drawn from the catalog lists.
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


## Imported as a JSON resource in an export and a loose file in the editor and in headless
## runs -- the same split the locales and the npc catalog live with.
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
