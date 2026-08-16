extends Node3D

## Watches for somebody worth talking to, offers the prompt, and opens the conversation.
##
## Hung off the player rather than built into it, so anything else that walks around can
## be given the same reach later.

const PanelScript := preload("res://src/ui/dialogue_panel.gd")
const Hint := preload("res://src/ui/input_hint.gd")

## Written down once somebody has been met, so the flourish and the stranger's greeting both
## know the difference between a first meeting and a hundredth.
const MET := "met_%s"
## Softer than the one the debug key fires: warm rather than black, and over in a moment.
## Long enough to read as punctuation on the meeting, short enough not to be sat through
## every time a new person is found.
const MEETING_OFFSET := 0.2
const MEETING_TIME := 0.42
const MEETING_INK := Color(0.08, 0.06, 0.05, 1.0)

## Flat, because a bank a metre below the deck is still arm's reach.
@export var reach := 3.6
## How far off straight ahead a target may sit, as a dot against the camera's heading.
@export var facing := 0.35

var _target: Node3D
var _body: Node3D
var _talking := false


func _ready() -> void:
	_body = get_parent() as Node3D


func _process(_delta: float) -> void:
	if PanelScript.is_open():
		_aim(null)
		return
	## Belt and braces: a panel that went away without saying so would otherwise leave the
	## player standing there unable to move.
	if _talking:
		_talking = false
		if _body and _body.has_method("set_talking"):
			_body.set_talking(false)
	_aim(_nearest())


## The offer is written over whoever it is for, so only one of them may be showing it.
func _aim(actor: Node3D) -> void:
	if actor == _target:
		return
	if is_instance_valid(_target) and _target.has_method("withdraw_talk"):
		_target.withdraw_talk()
	_target = actor
	if _target and _target.has_method("offer_talk"):
		_target.offer_talk(Hint.label(&"interact", "E"))


## Nearest of whatever is in reach and roughly ahead. Distance is measured flat so a
## target standing lower in the water does not fall out of reach.
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


## The camera's heading when there is one, since that is where the player is looking, and
## the body's own otherwise.
func _look_basis() -> Basis:
	var camera := get_viewport().get_camera_3d()
	return camera.global_basis if camera else _body.global_basis


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_action_pressed(&"interact") or _target == null or PanelScript.is_open():
		return
	get_viewport().set_input_as_handled()
	_talk_to(_target)


func _talk_to(actor: Node3D) -> void:
	var graph: DialogueGraph = actor.graph()
	if not graph.is_valid():
		push_error("dialogue: %s cannot talk -- %s" % [actor.name, "; ".join(graph.errors())])
		return
	actor.face(_body)
	var meeting := _first_meeting(actor)
	var panel := PanelScript.open(get_tree(), graph, state())
	if panel == null:
		return
	_aim(null)
	## The body follows the words: moving while a line is being written, still while the
	## line sits there waiting on an answer.
	panel.speaking.connect(actor.speak)
	panel.listening.connect(actor.listen)
	panel.closed.connect(actor.rest)
	## The first line is already being written by the time there is a panel to connect to,
	## so its `speaking` went out before anybody was listening for it. Caught up by hand
	## rather than left to the second line, which would have them open every conversation
	## standing perfectly still through their own opening sentence.
	if panel.is_typing():
		actor.speak()
	else:
		actor.listen()
	## Last, so being surprised to see somebody wins over the talking loop underneath it.
	if meeting:
		actor.meet()
	if _body.has_method("set_talking"):
		_talking = true
		_body.set_talking(true)
		panel.closed.connect(func() -> void:
			_talking = false
			_body.set_talking(false))


## Meeting somebody for the first time is worth marking, and only happens once ever -- the
## flag rides in the journal with everything else the player has been told, so somebody met
## last week is not met again today.
##
## Answers whether this was the first time, and writes it down either way.
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


## The impact frame, borrowed off the combat feel and slowed down: a band sweeping the
## screen as somebody new is framed. Same effect the debug key fires, which is where this
## started.
func _meeting_frame(actor: Node3D) -> void:
	var scene := get_tree().current_scene
	var fx := scene.get_node_or_null(^"ImpactFX") if scene else null
	if fx == null or not fx.has_method("nuke"):
		return
	var to := actor.global_position - _body.global_position
	## Swept along the line between the two of them, so the band lies across the meeting
	## rather than at a fixed angle the camera happens to be at.
	var angle := rad_to_deg(atan2(to.y, Vector2(to.x, to.z).length()))
	fx.nuke(angle, MEETING_OFFSET, MEETING_INK, MEETING_TIME)


## Everything the player has been told and told others. Kept in the journal rather than on
## the player: it has to outlive this world, not just this conversation.
func state() -> DialogueState:
	return Journal.state()
