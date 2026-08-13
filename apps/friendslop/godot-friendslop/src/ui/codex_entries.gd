extends RefCounted

## What the Codex can show, found by looking rather than listed.
##
## A hand-written list is a second place to remember: a character gets added to
## the game and not to the Codex, and the Codex quietly stops being the place
## you check things. Scanning the directories the assets already live in means
## dropping a file in is the whole of adding it -- which is the same reason a
## weapon carries its own grip markers instead of the mount knowing about it.
##
## Anything that fails to load drops its own entry and leaves the rest standing.
## Half-finished assets are normal in a tree being worked in, and one of them
## should not take the viewer down with it.

const CHARACTER_DIR := "res://assets/characters/quaternius_ubc/models"
const HAIR_DIR := "res://assets/characters/quaternius_ubc/models/hair"
const FAUNA_DIR := "res://assets/environment/props/fauna"
## Real weapons live here once they have been exported. Until then the stand-ins
## carry the same contract, so nothing downstream can tell which it is holding.
const WEAPON_DIR := "res://assets/items/weapons"
const ANIMATIONS := [
	"res://assets/characters/quaternius_ubc/animations/UAL1.glb",
	"res://assets/characters/quaternius_ubc/animations/UAL2.glb",
]

const WeaponProxy := preload("res://src/items/weapon_proxy.gd")


## kind is what the viewer has to build, not what the thing is:
##   "character" -- a character_rig, with animation, IK and a weapon hand
##   "model"     -- a scene shown as it is, for creatures and props
##   "weapon"    -- held on its own, from a scene or one of the stand-ins
static func all() -> Array:
	var out: Array = []
	var hair := _scan(HAIR_DIR, ["glb", "gltf"])
	for path in _scan(CHARACTER_DIR, ["glb", "gltf"]):
		out.append({
			"name": "Character: %s" % _title(path),
			"kind": "character",
			"scene": path,
			# One piece of hair, not every piece: attaching the lot would stack
			# them on the same head.
			"attachments": hair.slice(0, 1),
			"animations": ANIMATIONS,
		})
	for path in _scan(FAUNA_DIR, ["tres"], true):
		var species = _try_load(path)
		# A creature resource is anything that can hand over a model. Testing for
		# that rather than for a class keeps fish and birds on the same footing
		# once fish exist.
		if species == null or not ("model" in species) or species.model == null:
			continue
		out.append({"name": "Creature: %s" % _title(path), "kind": "model", "species": species})
	out.append_array(weapons())
	return out


## Weapons on their own, and the same list the character's hand is offered.
static func weapons() -> Array:
	var out: Array = []
	for path in _scan(WEAPON_DIR, ["glb", "gltf", "tscn"], true):
		out.append({"name": "Weapon: %s" % _title(path), "kind": "weapon", "scene": path})
	for kind in WeaponProxy.kinds():
		out.append({"name": "Weapon: %s (proxy)" % kind, "kind": "weapon", "proxy": kind})
	return out


static func _scan(dir: String, suffixes: Array, deep := false) -> Array:
	var out: Array = []
	var handle := DirAccess.open(dir)
	if handle == null:
		return out
	handle.list_dir_begin()
	var name := handle.get_next()
	while name != "":
		var path := "%s/%s" % [dir, name]
		if handle.current_is_dir():
			if deep and not name.begins_with("."):
				out.append_array(_scan(path, suffixes, true))
		elif suffixes.has(name.get_extension().to_lower()):
			out.append(path)
		name = handle.get_next()
	handle.list_dir_end()
	out.sort()
	return out


static func _try_load(path: String):
	if not ResourceLoader.exists(path):
		return null
	return ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_REUSE)


static func _title(path: String) -> String:
	return path.get_file().get_basename().replace("_", " ")
