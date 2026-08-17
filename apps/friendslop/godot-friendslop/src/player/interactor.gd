extends Node3D


const PanelScript := preload("res://src/ui/dialogue_panel.gd")
const CardScript := preload("res://src/ui/meeting_card.gd")
const Hint := preload("res://src/ui/input_hint.gd")

const MET := "met_%s"
const MEETING_OFFSET := 0.2
const MEETING_TIME := 0.42
const MEETING_INK := Color(0.08, 0.06, 0.05, 1.0)

@export var reach := 3.6
@export var facing := 0.35

var _target: Node3D
var _body: Node3D
var _talking := false
var _card: Node


func _ready() -> void:
	_body = get_parent() as Node3D


func _process(_delta: float) -> void:
	if busy():
		_aim(null)
		return
	if _talking:
		_talking = false
		if _body and _body.has_method("set_talking"):
			_body.set_talking(false)
	_aim(_nearest())


func busy() -> bool:
	return PanelScript.is_open() or is_instance_valid(_card)


func _aim(actor: Node3D) -> void:
	if actor == _target:
		return
	if is_instance_valid(_target) and _target.has_method("withdraw_talk"):
		_target.withdraw_talk()
	_target = actor
	if _target and _target.has_method("offer_talk"):
		_target.offer_talk(Hint.label(&"interact", "E"))


func _nearest() -> Node3D:
	if _body == null:
		return null
	var ahead := -_look_basis().z
	ahead.y = 0.0
	ahead = ahead.normalized()
	var best: Node3D = null
	var best_gap := INF
	for node in get_tree().get_nodes_in_group(NpcActor.GROUP):
		var actor := node as Node3D
		if actor == null or not actor.has_method("can_talk") or not actor.can_talk():
			continue
		var to: Vector3 = actor.global_position - _body.global_position
		to.y = 0.0
		var gap := to.length()
		var limit: float = actor.talk_range() if actor.has_method("talk_range") else reach
		if gap > minf(limit, reach) or gap < 0.001:
			continue
		if ahead.dot(to / gap) < facing:
			continue
		if gap < best_gap:
			best_gap = gap
			best = actor
	return best


func _look_basis() -> Basis:
	var camera := get_viewport().get_camera_3d()
	return camera.global_basis if camera else _body.global_basis


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed(&"interact") or _target == null or busy():
		return
	get_viewport().set_input_as_handled()
	_talk_to(_target)


func _talk_to(actor: Node3D) -> void:
	var graph: DialogueGraph = actor.graph()
	if not graph.is_valid():
		push_error("dialogue: %s cannot talk -- %s" % [actor.name, "; ".join(graph.errors())])
		return
	actor.face(_body)
	_aim(null)
	if _first_meeting(actor):
		actor.meet()
		var card := CardScript.present(get_tree(), actor.display_name(), actor.role_name())
		_card = card
		card.tree_exited.connect(func() -> void: _after_card(actor, graph), CONNECT_ONE_SHOT)
		return
	_open_talk(actor, graph)


func _after_card(actor: Node3D, graph: DialogueGraph) -> void:
	_card = null
	if is_instance_valid(actor) and actor.is_inside_tree():
		_open_talk(actor, graph)


func _open_talk(actor: Node3D, graph: DialogueGraph) -> DialoguePanel:
	if not is_instance_valid(actor) or not is_instance_valid(_body):
		return null
	var who := str(actor.npc_ref)
	Journal.brief(who, state())
	Quests.brief(state())
	Journal.talking_to(who)
	var read_before := state().seen_count()

	var panel := PanelScript.open(get_tree(), graph, state())
	if panel == null:
		return null
	panel.closed.connect(func() -> void:
		Journal.remember_talk(who, state().seen_count() > read_before)
		Quests.hand_back(who)
		Journal.talking_to(""))
	Quests.met(who)
	panel.speaking.connect(actor.speak)
	panel.listening.connect(actor.listen)
	panel.closed.connect(actor.rest)
	if panel.is_typing():
		actor.speak()
	else:
		actor.listen()
	if _body.has_method("set_talking"):
		_talking = true
		_body.set_talking(true)
		panel.closed.connect(func() -> void:
			_talking = false
			_body.set_talking(false))
	return panel


func _first_meeting(actor: Node3D) -> bool:
	var who := str(actor.npc_ref) if actor.get("npc_ref") != null else ""
	if who == "":
		return false
	var flag := MET % who
	if state().has_flag(flag):
		return false
	state().set_flag(flag)
	_meeting_frame(actor)
	return true


func _meeting_frame(actor: Node3D) -> void:
	var scene := get_tree().current_scene
	var fx := scene.get_node_or_null(^"ImpactFX") if scene else null
	if fx == null or not fx.has_method("nuke"):
		return
	var to := actor.global_position - _body.global_position
	var angle := rad_to_deg(atan2(to.y, Vector2(to.x, to.z).length()))
	fx.nuke(angle, MEETING_OFFSET, MEETING_INK, MEETING_TIME)


func state() -> DialogueState:
	return Journal.state()
