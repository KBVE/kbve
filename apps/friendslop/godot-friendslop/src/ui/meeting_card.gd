class_name MeetingCard
extends CanvasLayer

## The card that names somebody the first time they are met.
##
## Shown on its own, before the conversation opens: the impact frame cuts, the name reads
## across the screen, and only once it has cleared does the talk begin. A name arriving at
## the same time as the panel is a caption; a name arriving before it is an introduction.
##
## Nothing here knows who it is for or why. It is handed a name and a title, puts them up,
## and says when it is finished.

signal finished

## Long enough to read a name and notice it, short enough that meeting the eighth person by
## the crossing is not a cutscene. Skippable regardless.
const RISE := 0.22
const HOLD := 0.95
const FALL := 0.26
## The name lifts as it fades, which is what keeps it from reading as a HUD label.
const DRIFT := 18.0

const NAME_FONT := 76
const ROLE_FONT := 22
const EYEBROW_FONT := 18
const RULE_WIDTH := 260.0

## Sat above the dialogue panel's own layer: for the moment it is up, it is the only thing
## on screen worth reading.
const LAYER := 130

var _root: Control
var _column: VBoxContainer
var _done := false
var _elapsed := 0.0


## Puts a card up and hands it back. Parented to the world rather than the tree root, so
## leaving mid-introduction takes it with you.
static func present(tree: SceneTree, who: String, title := "") -> MeetingCard:
	var card := MeetingCard.new()
	card.name = "MeetingCard"
	var host: Node = tree.current_scene if tree.current_scene != null else tree.root
	host.add_child(card)
	card._build(who, title)
	card._play()
	return card


func _init() -> void:
	layer = LAYER
	process_mode = Node.PROCESS_MODE_ALWAYS


func _build(who: String, title: String) -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_root = root

	var column := VBoxContainer.new()
	column.set_anchors_preset(Control.PRESET_CENTER)
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 6)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(column)
	_column = column

	column.add_child(_line(I18n.t("dlg.met"), EYEBROW_FONT, MenuStyle.PAPER))
	column.add_child(_line(who, NAME_FONT, MenuStyle.PAPER_HOVER))
	column.add_child(_rule())
	## Only where the catalog carries one -- half the people by the crossing are archetypes
	## with no title, and an empty line under a name reads as a missing string.
	if title != "":
		column.add_child(_line(title, ROLE_FONT, MenuStyle.PAPER))


func _line(text: String, size: int, tint: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", tint)
	## Read over grass and water rather than over a panel, so the letters carry their own
	## dark edge instead of relying on anything behind them.
	label.add_theme_color_override("font_outline_color", Color(0.05, 0.04, 0.03, 0.9))
	label.add_theme_constant_override("outline_size", 8)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


func _rule() -> Panel:
	var rule := Panel.new()
	rule.custom_minimum_size = Vector2(RULE_WIDTH, 1.0)
	rule.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	var ink := StyleBoxFlat.new()
	ink.bg_color = MenuStyle.PAPER_EDGE
	rule.add_theme_stylebox_override("panel", ink)
	rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return rule


## Advanced by hand rather than by a tween.
##
## A tween is a second thing that has to keep running for this one to end, and the card is
## what the conversation behind it is waiting on -- a tween that never reaches its callback
## leaves the player unable to talk to anybody ever again. Counting the seconds here means
## the card cannot end in any way except the one that also tells the interactor.
func _play() -> void:
	_root.modulate.a = 0.0
	_column.position.y = DRIFT
	_elapsed = 0.0
	set_process(true)


func _process(delta: float) -> void:
	if _done:
		return
	_elapsed += delta
	if _elapsed >= RISE + HOLD + FALL:
		dismiss()
		return
	## Up, held, and away, with the drift running against the fade at both ends.
	var shown := 1.0
	var lift := 0.0
	if _elapsed < RISE:
		shown = _eased(_elapsed / RISE)
		lift = DRIFT * (1.0 - shown)
	elif _elapsed > RISE + HOLD:
		var out := _eased((_elapsed - RISE - HOLD) / FALL)
		shown = 1.0 - out
		lift = -DRIFT * out
	_root.modulate.a = shown
	_column.position.y = lift


static func _eased(t: float) -> float:
	var at := clampf(t, 0.0, 1.0)
	return 1.0 - pow(1.0 - at, 3.0)


## How long a card takes start to finish, for anything that would rather wait than listen.
static func length() -> float:
	return RISE + HOLD + FALL


## Reentrant, because it is reached from the tween, from a keypress, and from the world
## going away underneath it.
func dismiss() -> void:
	if _done:
		return
	_done = true
	finished.emit()
	queue_free()


## A card is a beat, not a wall: anything that means "go on" takes it down early.
func _input(event: InputEvent) -> void:
	if _done:
		return
	if event.is_action_pressed(&"interact") or event.is_action_pressed(&"ui_accept") \
			or event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		dismiss()


func _exit_tree() -> void:
	dismiss()
