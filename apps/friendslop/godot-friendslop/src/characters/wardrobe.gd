class_name Wardrobe
extends RefCounted

## Every piece of clothing the kit can put on a character, read off the asset folder
## rather than listed here.
##
## The pack names its parts `Sex_Outfit_Part[_Variant]`, so the file name already says
## everything the game needs: `Male_Ranger_Head_Hood` is the hood from the male ranger set
## and it goes on the head. Adding a piece is dropping a mesh in the folder.
##
## Slots are the equipment slots the item catalog already uses, so a piece of clothing and
## an item that grants it can name the same one.

const DIR := "res://assets/characters/quaternius_ubc/models/outfits"

## What the pack calls a part, against what the game calls the slot it occupies.
const SLOT_OF_PART := {
	"Head": &"head",
	"Body": &"chest",
	"Arms": &"hands",
	"Legs": &"legs",
	"Feet": &"feet",
}
## Accessories are two different things wearing one word: something around the neck, and
## something over the shoulders. They are separated by name so a knight can wear his
## scarf and his pauldrons at once, which one shared slot would not allow.
const NECK_PARTS := ["Scarf", "Gorget"]
const ACCESSORY_SLOT := &"back"
const NECK_SLOT := &"neck"

## The slots clothing covers between them. A base body is only swapped for a bare head
## once all of these are filled, since a half-dressed character still needs legs.
const COVERING := [&"chest", &"hands", &"legs", &"feet"]

static var _pieces: Dictionary = {}


## The whole catalog, keyed by piece id. Read once and kept, since the folder does not
## change while the game is running.
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


## Everything belonging to one set, so a character can be dressed in a whole outfit rather
## than a piece at a time.
## The piece a set's part comes to for a given body, whatever the pack happened to call
## the variant.
##
## The two halves of the pack do not agree with themselves: the male ranger's boots are
## `Feet_Boots` and the female's are plain `Feet`, and his shoulder is `Acc_Pauldron` to
## her `Acc_Pauldrons`. An item names one look for everybody, so the exact name is tried
## first and the set-and-part it belongs to answers when that misses.
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


## The sets the pack ships, which is what a picker lists.
static func outfits(sex: String) -> Array[String]:
	var out: Array[String] = []
	for id: StringName in all():
		var entry: Dictionary = _pieces[id]
		if entry[&"sex"] == sex and not out.has(entry[&"outfit"]):
			out.append(entry[&"outfit"])
	out.sort()
	return out


## Whether a set of equipped slots hides the body underneath it. Below this the character
## keeps its own arms and legs, or a hood alone would leave them a floating head.
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
		## Godot hands an export the .import file and the editor the .glb, so both arrive
		## here depending on where the game is running.
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
