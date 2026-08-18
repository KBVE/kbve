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

@export_group("Routine")
@export var clock_path: NodePath = ^"../DayNight"
@export var physics_path: NodePath = ^"../Physics"
@export var walk_speed := 1.0
@export var turn_rate := 4.0
@export var walk_animation := "UAL2/Walk_Fwd"

const DRY_MARGIN := 0.6
const DRY_STEP := 0.75
const DRY_REACH := 60.0

const LEFT_BEHIND := 3.0
const CATCH_UP := 2.5
const BLOCKED_FRACTION := 0.3
const BLOCKED_AFTER := 0.5
const SIDESTEP_FOR := 1.1
const WORK_PREFIX := "UAL2/"

const GRAVITY := -9.8
const CAPSULE_RADIUS := 0.4
const CAPSULE_HALF_HEIGHT := 0.5
const CAPSULE_CENTER := Vector3(0.0, 1.0, 0.0)
const LAYER_CREATURE := 4
const MASK_WORLD_AND_BODIES := 5

var rig: Node3D

var _terrain: Node
var _nameplate: Label3D
var _prompt: Label3D
var _routine: QRoutine
var _clock: Node
var _stand := Vector3.ZERO
var _attending: Node3D
var _stops: Array = []
var _worked_at := -1
var _worked := -1
var _sim: Node
var _sim_id := 0
var _sim_off := false
var _fall := 0.0
var _last_spot := Vector3.ZERO
var _blocked_t := 0.0
var _sidestep_t := 0.0
var _side := 1.0


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
	if _sim_id != 0 and is_instance_valid(_sim):
		_sim.despawn(_sim_id)
		_sim_id = 0


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
	attend(null)
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
		_lay_route.call_deferred()
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
	_lay_route()


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
	var middle := (a + b) * 0.5
	var at := bridge_spot(span, bridge_offset, bridge_along)
	at = dry_spot(_terrain, at, middle, along)
	global_position = Vector3(at.x, 0.0, at.z)
	_settle()
	look_at(Vector3(middle.x, global_position.y, middle.z), Vector3.UP)


static func bridge_spot(span: PackedFloat32Array, offset: float, along_by: float) -> Vector3:
	if span.size() < 5:
		return Vector3.ZERO
	var a := Vector3(span[0], 0.0, span[1])
	var b := Vector3(span[2], 0.0, span[3])
	var half_width := span[4]
	var along := (b - a)
	if along.length() < 0.001:
		return a
	along = along.normalized()
	var side := Vector3(-along.z, 0.0, along.x)
	var side_of_road := -1.0 if offset < 0.0 else 1.0
	var clear := side_of_road * (half_width + absf(offset))
	return (a + b) * 0.5 + along * along_by + side * clear


static func dry_spot(terrain: Node, at: Vector3, middle: Vector3, along: Vector3) -> Vector3:
	if terrain == null or not terrain.has_method("water_level_at") \
			or not terrain.has_method("height_at"):
		return at
	var dry: float = terrain.water_level_at() + DRY_MARGIN
	if terrain.height_at(at.x, at.z) > dry:
		return at
	var away := signf((at - middle).dot(along))
	if is_zero_approx(away):
		away = 1.0
	var walked := 0.0
	while walked < DRY_REACH:
		walked += DRY_STEP
		var probe := at + along * (away * walked)
		if terrain.height_at(probe.x, probe.z) > dry:
			return probe
	push_warning("npc: no dry ground within %.0fm of the crossing" % DRY_REACH)
	return at


func _settle() -> void:
	if _terrain != null and _terrain.has_method("height_at"):
		global_position.y = _terrain.height_at(global_position.x, global_position.z)


func _lay_route() -> void:
	_stand = global_position
	_clock = get_node_or_null(clock_path)
	var stops := _authored_stops()
	if stops.is_empty() or _clock == null or not ClassDB.class_exists("QRoutine"):
		return
	stops.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return float(a.get("hour", 0.0)) < float(b.get("hour", 0.0)))
	_stops = stops
	_routine = QRoutine.create(_clock.hour_seconds())
	_routine.set_speed(walk_speed)
	for stop: Dictionary in stops:
		_routine.add_stop(
				_post_at(Vector3(float(stop.get("offsetX", 0.0)), 0.0,
						float(stop.get("offsetZ", 0.0)))),
				float(stop.get("hour", 0.0)))


func _authored_stops() -> Array:
	if npc_ref == "":
		return []
	var entry := Npcdb.npc(npc_ref)
	var raw: Variant = entry.get("routine", null)
	if not (raw is Dictionary):
		return []
	var routine: Dictionary = raw
	var speed: Variant = routine.get("walkSpeed", null)
	if speed != null:
		walk_speed = float(speed)
	var stops: Variant = routine.get("stops", null)
	return stops if stops is Array else []


func _post_at(step: Vector3) -> Vector3:
	var span := _span()
	if span.size() < 5 or not stand_under_bridge:
		return _dry(_stand + Vector3(step.x, 0.0, step.z))
	return _dry(bridge_spot(span, bridge_offset + step.x, bridge_along + step.z))


func _dry(wanted: Vector3) -> Vector3:
	var away := wanted - _stand
	away.y = 0.0
	if _terrain == null or away.length() < 0.001:
		return wanted
	return dry_spot(_terrain, wanted, _stand, away.normalized())


func _span() -> PackedFloat32Array:
	if _terrain == null or not _terrain.has_method("bridge_span"):
		return PackedFloat32Array()
	return _terrain.bridge_span()


func _join_sim() -> void:
	if _sim_off or _sim_id != 0:
		return
	if OS.get_environment("Q_GODOT_PHYSICS") != "":
		_sim_off = true
		return
	var node := get_node_or_null(physics_path)
	if node == null or not node.has_method("spawn_character"):
		_sim_off = true
		return
	if not node.is_terrain_ready():
		return
	_sim = node
	_sim_id = _sim.spawn_character(self, CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS,
			CAPSULE_CENTER, LAYER_CREATURE, MASK_WORLD_AND_BODIES)


func _physics_process(delta: float) -> void:
	if _routine == null:
		return
	_join_sim()
	_check_attention()
	if _attending != null:
		_face_softly(_attending, delta)
		_carry(Vector3.ZERO, delta)
		_perform(idle_animation, "")
		return
	_routine.set_hour_seconds(_clock.hour_seconds())
	var here: Dictionary = _routine.at(_clock.hour)
	if here.is_empty():
		_carry(Vector3.ZERO, delta)
		return
	var wanted: Vector3 = here["at"]
	var step := Vector3(wanted.x - global_position.x, 0.0, wanted.z - global_position.z)
	var reach := walk_speed * CATCH_UP
	var behind := step.length()
	var wish := Vector3.ZERO
	if behind > reach * delta:
		wish = step / behind * minf(reach, behind / delta)
	wish = _steer_around(wish, delta)
	_carry(wish, delta)

	var walking: bool = here["walking"]
	if wish == Vector3.ZERO and not walking:
		_stand_at(int(here["stop"]), float(here["stood"]))
		return
	_turn_toward(wish if wish != Vector3.ZERO else step, delta)
	_perform(walk_animation, idle_animation)


func _steer_around(wish: Vector3, delta: float) -> Vector3:
	if _sim_id == 0 or wish == Vector3.ZERO:
		_blocked_t = 0.0
		_sidestep_t = 0.0
		return wish
	if _sidestep_t > 0.0:
		_sidestep_t -= delta
		return Vector3(-wish.z, 0.0, wish.x).normalized() * wish.length() * _side
	var moved := global_position.distance_to(_last_spot)
	_last_spot = global_position
	if moved < wish.length() * delta * BLOCKED_FRACTION:
		_blocked_t += delta
	else:
		_blocked_t = 0.0
	if _blocked_t >= BLOCKED_AFTER:
		_blocked_t = 0.0
		_sidestep_t = SIDESTEP_FOR
		_side = -_side
		return Vector3(-wish.z, 0.0, wish.x).normalized() * wish.length() * _side
	return wish


func _carry(wish: Vector3, delta: float) -> void:
	if _sim_id == 0:
		if wish != Vector3.ZERO:
			global_position += wish * delta
			_settle()
		return
	if _sim.character_grounded(_sim_id):
		_fall = 0.0
	else:
		_fall += GRAVITY * delta
	_sim.move_character(_sim_id, (wish + Vector3(0.0, _fall, 0.0)) * delta)


func _face_softly(who: Node3D, delta: float) -> void:
	if not is_instance_valid(who):
		return
	var to := who.global_position - global_position
	to.y = 0.0
	if to.length_squared() > 0.0001:
		_turn_toward(to, delta)


func _stand_at(stop: int, stood: float) -> void:
	var task := _task_of(stop)
	if task == "" or not _can_play(task):
		_perform(idle_animation, "")
	elif rig.animation.current_animation != task or not rig.animation.is_playing():
		rig.animation.play(task)
	_produce(stop, stood)


func _task_of(stop: int) -> String:
	if stop < 0 or stop >= _stops.size():
		return ""
	var task := str(_stops[stop].get("task", ""))
	return WORK_PREFIX + task if task != "" and not task.contains("/") else task


func _produce(stop: int, stood: float) -> void:
	if stop < 0 or stop >= _stops.size():
		return
	var entry: Dictionary = _stops[stop]
	var item := str(entry.get("yieldItem", ""))
	var minutes := float(entry.get("yieldMinutes", 0.0))
	if item == "" or minutes <= 0.0:
		return
	var period: float = minutes / 60.0 * _clock.hour_seconds()
	var done := int(stood / period)
	if stop != _worked_at:
		_worked_at = stop
		_worked = done
		return
	if done <= _worked:
		return
	_worked = done
	var ground := GroundItems.of(get_tree())
	if ground != null:
		ground.drop(StringName(item), 1, global_position)


func _turn_toward(dir: Vector3, delta: float) -> void:
	rotation.y = lerp_angle(rotation.y, atan2(-dir.x, -dir.z),
			clampf(turn_rate * delta, 0.0, 1.0))


func _check_attention() -> void:
	if _attending == null:
		return
	if not is_instance_valid(_attending) \
			or _attending.global_position.distance_to(global_position) \
					> talk_radius * LEFT_BEHIND:
		attend(null)


func attend(who: Node3D) -> void:
	_attending = who


func can_talk() -> bool:
	return npc_ref != "" or dialogue_path != ""


func talk_range() -> float:
	return talk_radius


func face(who: Node3D) -> void:
	if who == null:
		return
	attend(who)
	var to := who.global_position - global_position
	to.y = 0.0
	if to.length_squared() < 0.0001:
		return
	look_at(global_position + to, Vector3.UP)


func graph() -> DialogueGraph:
	if npc_ref != "":
		return Npcdb.graph(npc_ref)
	return DialogueGraphScript.from_path(dialogue_path)
