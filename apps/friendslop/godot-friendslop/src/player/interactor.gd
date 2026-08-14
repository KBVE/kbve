extends Node3D

## Watches for somebody worth talking to, offers the prompt, and opens the conversation.
##
## Hung off the player rather than built into it, so anything else that walks around can
## be given the same reach later.

const PanelScript := preload("res://src/ui/dialogue_panel.gd")

## Flat, because a bank a metre below the deck is still arm's reach.
@export var reach := 3.6
## How far off straight ahead a target may sit, as a dot against the camera's heading.
@export var facing := 0.35
@export var prompt_font := 18

var _target: Node3D
var _prompt: Label
var _layer: CanvasLayer
var _body: Node3D
var _talking := false
var _state := DialogueState.new()


func _ready() -> void:
	_body = get_parent() as Node3D
	_build_prompt()


func _build_prompt() -> void:
	_layer = CanvasLayer.new()
	_layer.layer = 60
	add_child(_layer)
	_prompt = Label.new()
	_prompt.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_prompt.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_prompt.offset_top = -140.0
	_prompt.offset_bottom = -110.0
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.add_theme_font_size_override("font_size", prompt_font)
	_prompt.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	_prompt.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.03))
	_prompt.add_theme_constant_override("outline_size", 6)
	_prompt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_prompt.visible = false
	_layer.add_child(_prompt)


func _process(_delta: float) -> void:
	if PanelScript.is_open():
		_prompt.visible = false
		return
	## Belt and braces: a panel that went away without saying so would otherwise leave the
	## player standing there unable to move.
	if _talking:
		_talking = false
		if _body and _body.has_method("set_talking"):
			_body.set_talking(false)
	_target = _nearest()
	_prompt.visible = _target != null
	if _target:
		_prompt.text = I18n.t("prompt.talk", {"name": _target.display_name()})


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
	_prompt.visible = false
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
