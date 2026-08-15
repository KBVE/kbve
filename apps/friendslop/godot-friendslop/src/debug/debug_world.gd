extends Node3D

## A blank canvas for finding where the frame budget actually goes.
##
## The scene starts as a floor, a light and the player, and each world system is added on
## top as its own toggleable layer. Read the HUD, press the key, read it again: the
## difference is that system's cost, measured rather than guessed. Layers toggle live, so
## one session covers every combination instead of one build per experiment.

## Strip the material overrides off the character so it draws on stock lighting.
@export var unshade_player := true
## The ink post-process lives on the player's camera and outlines every silhouette in the
## scene. First thing to rule out when foliage reads as cutouts.
@export var disable_ink_lines := true

## Number key -> node, in the order they get switched on. Keep this list in the order the
## world builds itself, so walking up the keys walks up the cost.
const LAYERS: Array[Dictionary] = [
	{"key": KEY_1, "node": ^"Terrain", "label": "Terrain"},
	{"key": KEY_2, "node": ^"GrassField", "label": "Grass"},
	{"key": KEY_3, "node": ^"FloraField", "label": "Flora"},
	{"key": KEY_4, "node": ^"ShrubField", "label": "Shrubs"},
	{"key": KEY_5, "node": ^"TreeField", "label": "Trees"},
	{"key": KEY_6, "node": ^"StoneField", "label": "Stones"},
	{"key": KEY_7, "node": ^"FishField", "label": "Fish"},
	{"key": KEY_8, "node": ^"PostFX", "label": "PostFX"},
]

## Properties worth switching off mid-session to see what they cost. The water shader
## turned out to be nearly free -- a white fallback material measured the same -- so what
## is left is the per-frame work that only runs when the player is in the water.
const FLAGS: Array[Dictionary] = [
	{"key": KEY_Q, "node": ^"Terrain", "prop": "wake_enabled", "label": "wake"},
	{"key": KEY_E, "node": ^"Sun", "prop": "shadow_enabled", "label": "sun shadows"},
]

## Toggled rather than measured by node, because it lives inside the player instance.
const INK_PATH := ^"Pivot/Camera3D/InkLines"

var _flat_ground: Node3D
var _ink: Node


func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_flat_ground = get_node_or_null(^"Ground")
	var player := get_node_or_null(^"Player")
	if player:
		_ink = player.get_node_or_null(INK_PATH)
		if _ink and disable_ink_lines:
			_ink.visible = false
		if unshade_player:
			_unshade(player)
	# The flat floor is scaffolding for the empty scene. Left in under real terrain it
	# becomes an invisible plane at y=0 that the player stands on wherever the ground
	# happens to dip below it.
	_sync_flat_ground()
	_report()


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	if key.keycode == KEY_R and _ink:
		_ink.visible = not _ink.visible
		print("[debug] ink lines = %s" % _ink.visible)
		return
	for flag in FLAGS:
		if key.keycode == flag["key"]:
			var owner_node := get_node_or_null(flag["node"])
			if owner_node:
				owner_node.set(flag["prop"], not owner_node.get(flag["prop"]))
				print("[debug] %s = %s" % [flag["label"], owner_node.get(flag["prop"])])
			return
	for layer in LAYERS:
		if key.keycode == layer["key"]:
			var node := get_node_or_null(layer["node"])
			if node:
				node.set("visible", not bool(node.get("visible")))
				node.process_mode = (
					Node.PROCESS_MODE_INHERIT
					if bool(node.get("visible"))
					else Node.PROCESS_MODE_DISABLED
				)
				_sync_flat_ground()
				_report()
			return


func _sync_flat_ground() -> void:
	if _flat_ground == null:
		return
	var terrain := get_node_or_null(^"Terrain") as Node3D
	var need_flat := terrain == null or not terrain.visible
	_flat_ground.visible = need_flat
	_flat_ground.process_mode = (
		Node.PROCESS_MODE_INHERIT if need_flat else Node.PROCESS_MODE_DISABLED
	)
	var shape := _flat_ground.get_node_or_null(^"CollisionShape3D") as CollisionShape3D
	if shape:
		shape.disabled = not need_flat


func _report() -> void:
	var on := PackedStringArray()
	for layer in LAYERS:
		var node := get_node_or_null(layer["node"])
		if node and bool(node.get("visible")):
			on.append(str(layer["label"]))
	print("[debug] layers on: ", ", ".join(on) if on.size() > 0 else "none (player only)")
	print("[debug] keys: 1-8 layers, Q wake, E sun shadows, R ink lines")


## Replaces every material on the subtree with a plain one. Walked rather than set on the
## root because the character is a GLB with its meshes several levels down, and an
## override on a parent node is not inherited by them.
func _unshade(node: Node) -> void:
	var plain := StandardMaterial3D.new()
	plain.albedo_color = Color(0.82, 0.72, 0.64)
	for child in node.find_children("*", "GeometryInstance3D", true, false):
		var geo := child as GeometryInstance3D
		geo.material_override = plain
