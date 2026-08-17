class_name Wardrobe
extends RefCounted


const DIR := "res://assets/characters/quaternius_ubc/models/outfits"

const SLOT_OF_PART := {
	"Head": &"head",
	"Body": &"chest",
	"Arms": &"hands",
	"Legs": &"legs",
	"Feet": &"feet",
}
const NECK_PARTS := ["Scarf", "Gorget"]
const ACCESSORY_SLOT := &"back"
const NECK_SLOT := &"neck"

const COVERING := [&"chest", &"hands", &"legs", &"feet"]

static var _pieces: Dictionary = {}


static func all() -> Dictionary:
	if _pieces.is_empty():
		_scan()
	return _pieces


static func piece(id: StringName) -> Dictionary:
	return all().get(id, {})


static func has(id: StringName) -> bool:
	return all().has(id)


static func path_of(id: StringName) -> String:
	return str(piece(id).get(&"path", ""))


static func slot_of(id: StringName) -> StringName:
	return piece(id).get(&"slot", &"")


static func match_piece(sex: String, outfit_name: String, part: String) -> StringName:
	for id: StringName in all():
		var entry: Dictionary = _pieces[id]
		if entry[&"sex"] == sex \
				and str(entry[&"outfit"]).to_lower() == outfit_name.to_lower() \
				and str(entry[&"part"]).to_lower() == part.to_lower():
			return id
	return &""


static func outfit(sex: String, outfit_name: String) -> Array[StringName]:
	var out: Array[StringName] = []
	for id: StringName in all():
		var entry: Dictionary = _pieces[id]
		if entry[&"sex"] == sex and entry[&"outfit"] == outfit_name:
			out.append(id)
	out.sort()
	return out


static func outfits(sex: String) -> Array[String]:
	var out: Array[String] = []
	for id: StringName in all():
		var entry: Dictionary = _pieces[id]
		if entry[&"sex"] == sex and not out.has(entry[&"outfit"]):
			out.append(entry[&"outfit"])
	out.sort()
	return out


static func covers_the_body(slots: Array) -> bool:
	for slot: StringName in COVERING:
		if not slots.has(slot):
			return false
	return true


static func _scan() -> void:
	var handle := DirAccess.open(DIR)
	if handle == null:
		push_warning("wardrobe: no outfits at %s" % DIR)
		return
	handle.list_dir_begin()
	var name := handle.get_next()
	while name != "":
		if name.get_extension().to_lower() in ["glb", "gltf"]:
			_add(name.get_basename())
		elif name.ends_with(".import"):
			_add(name.trim_suffix(".import").get_basename())
		name = handle.get_next()
	handle.list_dir_end()


static func _add(stem: String) -> void:
	var bits := stem.split("_", false)
	if bits.size() < 3:
		push_warning("wardrobe: cannot read a slot out of '%s'" % stem)
		return
	var part := bits[2]
	var variant := "_".join(Array(bits).slice(3)) if bits.size() > 3 else ""
	var slot := _slot(part, variant)
	if slot == &"":
		push_warning("wardrobe: '%s' has no slot for part '%s'" % [stem, part])
		return
	var id := StringName(stem.to_lower())
	if _pieces.has(id):
		return
	_pieces[id] = {
		&"id": id,
		&"path": "%s/%s.glb" % [DIR, stem],
		&"slot": slot,
		&"sex": bits[0],
		&"outfit": bits[1],
		&"part": part,
		&"variant": variant,
	}


static func _slot(part: String, variant: String) -> StringName:
	if part == "Acc":
		return NECK_SLOT if NECK_PARTS.has(variant) else ACCESSORY_SLOT
	return SLOT_OF_PART.get(part, &"")
