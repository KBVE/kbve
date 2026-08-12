extends RefCounted

## What the Codex can show, as data.
##
## Adding a character, a creature or a weapon is a line here rather than a
## branch in the viewer, which is the point: the reason a pose or a grip gets
## checked by launching the game and walking somewhere is that there is nowhere
## cheaper to look at it.
##
## Paths are loaded rather than preloaded so a half-finished asset takes its own
## entry out of the list instead of the whole Codex with it.

const BODY := "res://assets/characters/quaternius_ubc/models/Regular_Male_FullBody.glb"
const HAIR := "res://assets/characters/quaternius_ubc/models/hair/Hair_Ponytail.glb"
const UAL1 := "res://assets/characters/quaternius_ubc/animations/UAL1.glb"
const UAL2 := "res://assets/characters/quaternius_ubc/animations/UAL2.glb"

const WeaponProxy := preload("res://src/items/weapon_proxy.gd")


## kind is what the viewer has to build, not what the thing is:
##   "character" -- a character_rig, with animation, IK and a weapon hand
##   "model"     -- a scene shown as it is, for props and creatures
##   "weapon"    -- one of the stand-ins, on its own
static func all() -> Array:
	var out: Array = []
	if ResourceLoader.exists(BODY):
		out.append({"name": "Character", "kind": "character", "scene": BODY,
				"attachments": [HAIR], "animations": [UAL1, UAL2]})
	for kind in WeaponProxy.kinds():
		out.append({"name": "Weapon: %s" % kind, "kind": "weapon", "proxy": kind})
	return out


## Creature entries come from whatever the scene hands in, since a species is a
## resource the game already owns and duplicating it here would let the two
## drift.
static func with_species(entries: Array, species) -> Array:
	if species and species.model:
		entries.append({"name": "Bird: %s" % species.resource_path.get_file(),
				"kind": "model", "species": species})
	return entries
