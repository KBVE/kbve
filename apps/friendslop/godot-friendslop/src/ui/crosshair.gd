extends CanvasLayer

const Harvester := preload("res://src/player/harvester.gd")

@export var arm := 7.0
@export var gap := 3.0
@export var thickness := 2.0
@export var dot := 1.5
@export var color := Color(1.0, 1.0, 1.0, 0.85)
@export var outline := Color(0.0, 0.0, 0.0, 0.5)
## Shown while a rock or tree is in reach and in front. The crosshair is the only
## thing that says a swing would land, so without this the player finds out by
## swinging and watching nothing happen.
@export var target_color := Color(1.0, 0.86, 0.45, 0.95)
## How far the arms open when something is under the mark.
@export var target_gap := 7.0
## How quickly the mark opens and closes, as a fraction closed per second.
@export var settle := 14.0

var _settings: Node
var _draw_layer: Control
var _harvester: Node
## Eased rather than switched, so the mark reads as opening onto something instead
## of flickering between two sizes when a target sits at the edge of the cone.
var _aim := 0.0
var _aim_wanted := 0.0


func _ready() -> void:
	layer = 10
	_draw_layer = Control.new()
	_draw_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_draw_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_draw_layer.draw.connect(_draw_crosshair)
	add_child(_draw_layer)
	get_window().size_changed.connect(_draw_layer.queue_redraw)

	_settings = get_tree().current_scene.get_node_or_null("GameplaySettings")
	if _settings:
		_settings.changed.connect(_read_settings)
		_read_settings()


## The harvester arrives with the player, which is spawned rather than in the scene,
## so this is retried until it turns up instead of resolved once.
func _find_harvester() -> void:
	if _harvester and is_instance_valid(_harvester):
		return
	for node in get_tree().get_nodes_in_group(Harvester.GROUP):
		_harvester = node
		_harvester.aimed.connect(_on_aimed)
		return


func _on_aimed(target: StringName, _info: Dictionary) -> void:
	_aim_wanted = 0.0 if target == &"" else 1.0


func _process(delta: float) -> void:
	if _harvester == null or not is_instance_valid(_harvester):
		_find_harvester()
	if is_equal_approx(_aim, _aim_wanted):
		return
	_aim = move_toward(_aim, _aim_wanted, settle * delta)
	_draw_layer.queue_redraw()


func _read_settings() -> void:
	visible = _settings.crosshair and not get_tree().paused


func _draw_crosshair() -> void:
	var c := _draw_layer.size * 0.5
	var g: float = gap + target_gap * _aim
	var tint := color.lerp(target_color, _aim)
	for pass_i in 2:
		var col := outline if pass_i == 0 else tint
		var w := thickness + 2.0 if pass_i == 0 else thickness
		_draw_layer.draw_line(c + Vector2(-g - arm, 0.0), c + Vector2(-g, 0.0), col, w)
		_draw_layer.draw_line(c + Vector2(g, 0.0), c + Vector2(g + arm, 0.0), col, w)
		_draw_layer.draw_line(c + Vector2(0.0, -g - arm), c + Vector2(0.0, -g), col, w)
		_draw_layer.draw_line(c + Vector2(0.0, g), c + Vector2(0.0, g + arm), col, w)
		_draw_layer.draw_circle(c, dot + 1.0 if pass_i == 0 else dot, col)
