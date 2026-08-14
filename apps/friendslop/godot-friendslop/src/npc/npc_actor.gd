class_name NpcActor
extends Node3D

## Somebody standing in the world with something to say.
##
## The body is a character_rig, the same one the player wears, and the conversation is a
## DialogueGraph read off disk. Everything a talker needs and nothing a fighter does.

const CharacterRig := preload("res://src/characters/character_rig.gd")
const DialogueGraphScript := preload("res://src/dialogue/dialogue_graph.gd")

const GROUP := &"interactable"

@export var display_name_key := ""
@export var dialogue_path := ""
@export var terrain_path: NodePath
## Reach of the talk prompt, measured flat: a player on the bank and an NPC in the shallows
## are still within talking distance.
@export var talk_radius := 3.6

@export_group("Body")
@export var body: PackedScene
@export var attachments: Array[PackedScene] = []
@export var animation_sources: Array[PackedScene] = []
@export var idle_animation := ""
@export var skin_color := Color(1, 1, 1)
@export var hair_color := Color(0.214, 0.155, 0.047)
## Clearance over the top of the head for the nameplate.
@export var nameplate_clearance := 0.35
@export var nameplate_range := 40.0

@export_group("Placing")
## Puts him beside the crossing rather than wherever the scene was saved with him, since
## the bridge moves with the world seed.
@export var stand_under_bridge := false
## How far off the middle of the span he stands, past the deck's own half width.
@export var bridge_offset := 2.0
## Along the span, so he is at the bank end rather than out over the water.
@export var bridge_along := 9.0

var rig: Node3D

var _terrain: Node
var _nameplate: Label3D


func _ready() -> void:
	add_to_group(GROUP)
	_terrain = get_node_or_null(terrain_path)
	_build_body()
	_build_nameplate()
	if stand_under_bridge:
		_stand_under_bridge.call_deferred()
	elif _terrain != null:
		_settle.call_deferred()


func _build_body() -> void:
	if body == null:
		return
	rig = CharacterRig.new()
	rig.body = body
	rig.attachments = attachments
	rig.animation_sources = animation_sources
	rig.default_animation = idle_animation
	rig.skin_color = skin_color
	rig.hair_color = hair_color
	## Absolute, because the rig resolves it from its own place a level further down.
	if _terrain != null:
		rig.terrain_path = _terrain.get_path()
		rig.foot_ik = true
	rig.snap_to_terrain = false
	add_child(rig)


## Hung off the actor rather than the rig so it stays put while he turns.
func _build_nameplate() -> void:
	if display_name_key == "":
		return
	_nameplate = Label3D.new()
	_nameplate.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_nameplate.double_sided = true
	_nameplate.fixed_size = true
	_nameplate.pixel_size = 0.0004
	_nameplate.font_size = 64
	_nameplate.outline_size = 20
	_nameplate.visibility_range_end = nameplate_range
	_nameplate.visibility_range_end_margin = 8.0
	_nameplate.modulate = Color(1, 0.93, 0.8)
	_nameplate.outline_modulate = Color(0.05, 0.04, 0.08)
	_nameplate.position = Vector3(0.0, _head_height() + nameplate_clearance, 0.0)
	add_child(_nameplate)
	_refresh_name()
	I18n.locale_changed.connect(_refresh_name)


func _refresh_name() -> void:
	if _nameplate:
		_nameplate.text = display_name()


func display_name() -> String:
	return I18n.t(display_name_key) if display_name_key != "" else name


func _head_height() -> float:
	if rig and rig.has_method("mesh_extents"):
		var box: AABB = rig.mesh_extents()
		if box.size.y > 0.0:
			return box.position.y + box.size.y
	return 1.8


## The crossing is placed by the world seed, so where he stands is asked for rather than
## saved: beside the span, off to one side of the deck, at the bank end.
func _stand_under_bridge() -> void:
	if _terrain == null or not _terrain.has_method("bridge_span"):
		_settle()
		return
	var span: PackedFloat32Array = _terrain.bridge_span()
	if span.size() < 5:
		push_warning("npc: %s wants the bridge, but this world has no crossing" % name)
		_settle()
		return
	var a := Vector3(span[0], 0.0, span[1])
	var b := Vector3(span[2], 0.0, span[3])
	var half_width: float = span[4]
	var along := (b - a)
	if along.length() < 0.001:
		_settle()
		return
	along = along.normalized()
	var side := Vector3(-along.z, 0.0, along.x)
	var middle := (a + b) * 0.5
	var at := middle + along * bridge_along + side * (half_width + bridge_offset)
	global_position = Vector3(at.x, 0.0, at.z)
	_settle()
	## Facing the deck, so a player coming over the bridge meets his eyes rather than his
	## back.
	look_at(Vector3(middle.x, global_position.y, middle.z), Vector3.UP)


func _settle() -> void:
	if _terrain != null and _terrain.has_method("height_at"):
		global_position.y = _terrain.height_at(global_position.x, global_position.z)


## Waiting to be talked to. The interactor reads this off everything in reach and picks
## the nearest.
func can_talk() -> bool:
	return dialogue_path != ""


func talk_range() -> float:
	return talk_radius


## Turns to whoever started talking, flat, so he does not tip over on a slope.
func face(who: Node3D) -> void:
	if who == null:
		return
	var to := who.global_position - global_position
	to.y = 0.0
	if to.length_squared() < 0.0001:
		return
	look_at(global_position + to, Vector3.UP)


func graph() -> DialogueGraph:
	return DialogueGraphScript.from_path(dialogue_path)
