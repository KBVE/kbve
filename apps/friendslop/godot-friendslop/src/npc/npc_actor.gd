class_name NpcActor
extends Node3D


const CharacterRig := preload("res://src/characters/character_rig.gd")
const DialogueGraphScript := preload("res://src/dialogue/dialogue_graph.gd")
const Npcdb := preload("res://src/dialogue/npcdb_dialogue.gd")

const GROUP := &"interactable"

@export var npc_ref := ""
@export var display_name_key := ""
@export var dialogue_path := ""
@export var terrain_path: NodePath
@export var talk_radius := 3.6

@export_group("Body")
@export var body: PackedScene
@export var attachments: Array[PackedScene] = []
@export var worn: Array[StringName] = []
@export var head_only_body: PackedScene
@export var animation_sources: Array[PackedScene] = []
@export var idle_animation := ""
@export var skin_color := Color(1, 1, 1)
@export var hair_color := Color(0.214, 0.155, 0.047)
@export var nameplate_clearance := 0.35
@export var nameplate_range := 40.0
@export var prompt_drop := 0.28

@export_group("Performance")
@export var talk_animation := "UAL1/Idle_Talking"
@export var listen_animation := ""
@export var meeting_animation := "UAL2/Surprise"

@export_group("Placing")
@export var stand_under_bridge := false
@export var bridge_offset := 2.0
@export var bridge_along := 9.0

var rig: Node3D

var _terrain: Node
var _nameplate: Label3D
var _prompt: Label3D


func _ready() -> void:
	add_to_group(GROUP)
	_terrain = get_node_or_null(terrain_path)
	_build_body()
	_build_nameplate()
	_place_when_there_is_ground()
	_enlist()


func _enlist() -> void:
	if npc_ref == "":
		return
	var stats := _authored_stats()
	Vitals.enlist(
		vitals_id(),
		int(stats.get("strength", 1)),
		int(stats.get("skill", 1)),
		int(stats.get("will", 1)))


func _authored_stats() -> Dictionary:
	var entry := Npcdb.npc(npc_ref)
	if entry.is_empty():
		return {}
	var from_level := maxi(int(entry.get("level", 1)), 1)
	var raw: Variant = entry.get("stats", null)
	var stats: Dictionary = raw if raw is Dictionary else {}
	return {
		"strength": _rank(stats.get("strength", null), from_level),
		"skill": _rank(stats.get("agility", null), from_level),
		"will": _rank(stats.get("intelligence", null), from_level),
	}


func _rank(authored: Variant, fallback: int) -> int:
	if authored == null:
		return fallback
	return maxi(int(authored), 1)


func vitals_id() -> int:
	return Vitals.id_for(npc_ref)


func _exit_tree() -> void:
	if npc_ref != "":
		Vitals.retire(vitals_id())


func _build_body() -> void:
	if body == null:
		return
	rig = CharacterRig.new()
	rig.body = body
	rig.attachments = attachments
	rig.worn = worn
	rig.head_only_body = head_only_body
	rig.animation_sources = animation_sources
	rig.default_animation = idle_animation
	rig.skin_color = skin_color
	rig.hair_color = hair_color
	if _terrain != null:
		rig.terrain_path = _terrain.get_path()
		rig.foot_ik = true
	rig.snap_to_terrain = false
	add_child(rig)


func _build_nameplate() -> void:
	if display_name_key == "" and npc_ref == "":
		return
	var head := _head_height() + nameplate_clearance
	_nameplate = _floating_label(head, 64, Color(1, 0.93, 0.8))
	_prompt = _floating_label(head - prompt_drop, 44, MenuStyle.PAPER_HOVER)
	_prompt.visible = false
	_refresh_name()
	I18n.locale_changed.connect(_refresh_name)


func _floating_label(height: float, size: int, tint: Color) -> Label3D:
	var label := Label3D.new()
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.double_sided = true
	label.fixed_size = true
	label.pixel_size = 0.0004
	label.font_size = size
	label.outline_size = 20
	label.visibility_range_end = nameplate_range
	label.visibility_range_end_margin = 8.0
	label.modulate = tint
	label.outline_modulate = Color(0.05, 0.04, 0.08)
	label.position = Vector3(0.0, height, 0.0)
	add_child(label)
	return label


func _refresh_name() -> void:
	if _nameplate:
		_nameplate.text = display_name()


func offer_talk(key: String) -> void:
	if _prompt == null:
		return
	_prompt.text = I18n.t("prompt.talk", {"key": key})
	_prompt.visible = true


func withdraw_talk() -> void:
	if _prompt:
		_prompt.visible = false


func speak() -> void:
	_perform(talk_animation, idle_animation)


func listen() -> void:
	_perform(listen_animation, idle_animation)


func rest() -> void:
	_perform(idle_animation, "")


func meet() -> float:
	if meeting_animation == "" or not _can_play(meeting_animation):
		return 0.0
	rig.animation.play(meeting_animation)
	if _can_play(idle_animation):
		rig.animation.queue(idle_animation)
	return rig.animation.get_animation(meeting_animation).length


func _perform(clip: String, fallback: String) -> void:
	var wanted := clip if _can_play(clip) else fallback
	if not _can_play(wanted) or rig.animation.current_animation == wanted:
		return
	rig.animation.play(wanted)


func _can_play(clip: String) -> bool:
	return clip != "" and rig != null and rig.animation != null \
			and rig.animation.has_animation(clip)


func display_name() -> String:
	if display_name_key != "":
		return I18n.t(display_name_key)
	if npc_ref != "":
		var entry := Npcdb.npc(npc_ref)
		if not entry.is_empty():
			return str(entry.get("name", npc_ref))
	return name


func role_name() -> String:
	if npc_ref == "":
		return ""
	var entry := Npcdb.npc(npc_ref)
	return str(entry.get("role", "")) if not entry.is_empty() else ""


func _head_height() -> float:
	if rig and rig.has_method("mesh_extents"):
		var box: AABB = rig.mesh_extents()
		if box.size.y > 0.0:
			return box.position.y + box.size.y
	return 1.8


func _place_when_there_is_ground() -> void:
	if _terrain == null:
		return
	if not _terrain.has_method("is_ground_ready") or _terrain.is_ground_ready():
		_place.call_deferred()
		return
	if _terrain.has_signal("ground_ready"):
		_terrain.ground_ready.connect(_place, CONNECT_ONE_SHOT)
	else:
		_place.call_deferred()


func _place() -> void:
	if stand_under_bridge:
		_stand_under_bridge()
	else:
		_settle()


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
	var side_of_road := -1.0 if bridge_offset < 0.0 else 1.0
	var clear := side_of_road * (half_width + absf(bridge_offset))
	var at := middle + along * bridge_along + side * clear
	global_position = Vector3(at.x, 0.0, at.z)
	_settle()
	look_at(Vector3(middle.x, global_position.y, middle.z), Vector3.UP)


func _settle() -> void:
	if _terrain != null and _terrain.has_method("height_at"):
		global_position.y = _terrain.height_at(global_position.x, global_position.z)


func can_talk() -> bool:
	return npc_ref != "" or dialogue_path != ""


func talk_range() -> float:
	return talk_radius


func face(who: Node3D) -> void:
	if who == null:
		return
	var to := who.global_position - global_position
	to.y = 0.0
	if to.length_squared() < 0.0001:
		return
	look_at(global_position + to, Vector3.UP)


func graph() -> DialogueGraph:
	if npc_ref != "":
		return Npcdb.graph(npc_ref)
	return DialogueGraphScript.from_path(dialogue_path)
