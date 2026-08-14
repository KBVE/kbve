extends Node3D

## Watches for somebody worth talking to, offers the prompt, and opens the conversation.
##
## Hung off the player rather than built into it, so anything else that walks around can
## be given the same reach later.

const PanelScript := preload("res://src/ui/dialogue_panel.gd")
const Hint := preload("res://src/ui/input_hint.gd")

## Flat, because a bank a metre below the deck is still arm's reach.
@export var reach := 3.6
## How far off straight ahead a target may sit, as a dot against the camera's heading.
@export var facing := 0.35

var _target: Node3D
var _body: Node3D
var _talking := false
var _state := DialogueState.new()


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
	var panel := PanelScript.open(get_tree(), graph, _state)
	if panel == null:
		return
	_aim(null)
	if _body.has_method("set_talking"):
		_talking = true
		_body.set_talking(true)
		panel.closed.connect(func() -> void:
			_talking = false
			_body.set_talking(false))


## Everything the player has been told and told others, kept on the player so it outlives
## any one conversation.
func state() -> DialogueState:
	return _state
