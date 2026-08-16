class_name GroundItem
extends Node3D

## One lot of something lying on the ground, waiting to be picked back up.
##
## Drawn as a name-plate standing inside a glassy capsule, rather than as the item's own
## model: the catalog has 253 entries and no meshes for them, so a drop that is readable
## from across a clearing beats one that is accurate and invisible. The plate faces the
## camera, so a log looks the same from every side of the pile.
##
## The capsule is the part that reads as "loot" at a distance -- it catches the light,
## bobs, and turns -- and the plate inside it is the part that says which loot.

const RARITY := {
	&"common": Color(0.72, 0.70, 0.64),
	&"uncommon": Color(0.44, 0.76, 0.45),
	&"rare": Color(0.36, 0.58, 0.92),
	&"epic": Color(0.70, 0.42, 0.90),
	&"legendary": Color(0.94, 0.70, 0.28),
}

const BOB := 0.12
const BOB_SECONDS := 2.2
const SPIN_SECONDS := 6.0

var ref: StringName = &""
var count := 0

## Seconds it has been lying here, which is what the field ages it out on.
var age := 0.0
## Held down after a bag too full to take it, so a player standing on a drop they cannot
## carry is told once rather than once a frame.
var retry_in := 0.0

var _plate: Label3D
var _shell: MeshInstance3D
var _rest := 0.0
## Its own phase, so a heap of drops does not bob in lockstep like a machine.
var _phase := 0.0


## Kept out of `_init` so the field can build one, place it, and fill it in, which is the
## order a scene tree wants rather than the order a constructor imposes.
func setup(item: StringName, amount: int, phase := 0.0) -> void:
	ref = item
	count = amount
	_phase = phase
	if _plate != null:
		_refresh()


func _ready() -> void:
	_rest = position.y
	_build()
	_refresh()


func _build() -> void:
	var shell := CapsuleMesh.new()
	shell.radius = 0.22
	shell.height = 0.62
	shell.radial_segments = 12
	shell.rings = 4
	_shell = MeshInstance3D.new()
	_shell.mesh = shell
	_shell.position.y = 0.31
	_shell.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_shell.material_override = _glass()
	add_child(_shell)

	_plate = Label3D.new()
	_plate.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_plate.no_depth_test = false
	_plate.fixed_size = false
	_plate.pixel_size = 0.0032
	_plate.font_size = 64
	_plate.outline_size = 18
	_plate.outline_modulate = Color(0.04, 0.03, 0.02, 0.85)
	_plate.position.y = 0.34
	add_child(_plate)


## Lit from inside and unshaded, so a drop in the shade of a tree is still findable, and
## see-through enough that the plate inside reads through the front of it.
func _glass() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_BACK
	mat.albedo_color = Color(0.8, 0.8, 0.8, 0.22)
	return mat


func _refresh() -> void:
	var tint: Color = RARITY.get(StringName(Itemdb.item(ref).get("rarity", "common")), RARITY[&"common"])
	_plate.text = Itemdb.display_name(ref) if count <= 1 else "%s ×%d" % [Itemdb.display_name(ref), count]
	_plate.modulate = tint.lightened(0.35)
	var mat := _shell.material_override as StandardMaterial3D
	mat.albedo_color = Color(tint.r, tint.g, tint.b, 0.22)


## Takes some of the pile off, and says whether anything is left in it.
func take(amount: int) -> bool:
	count -= amount
	if count > 0:
		_refresh()
	return count <= 0


## Driven by the field rather than by its own `_process`, so a clearing full of drops is
## one node ticking and not fifty.
func advance(delta: float) -> void:
	age += delta
	retry_in = maxf(retry_in - delta, 0.0)
	var t := age + _phase
	position.y = _rest + sin(t * TAU / BOB_SECONDS) * BOB
	rotation.y = t * TAU / SPIN_SECONDS
