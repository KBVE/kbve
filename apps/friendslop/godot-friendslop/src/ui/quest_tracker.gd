extends CanvasLayer

## What the player is in the middle of, in the corner of the screen.
##
## Redrawn when the quest log says something changed rather than every frame: a quest moves
## a handful of times an hour, and a list rebuilt at sixty hertz is sixty rebuilds of the
## same three labels.

const LAYOUT_HEIGHT := 720.0
const SCALE_RANGE := Vector2(0.7, 1.4)
const MARGIN := Vector2(24.0, 92.0)
const WIDTH := 260.0
const HEADING_FONT := 13
const TITLE_FONT := 15
const STEP_FONT := 13

const HEADING := Color(0.93, 0.87, 0.72, 0.55)
const TITLE := Color(0.97, 0.9, 0.72, 0.92)
const STEP := Color(0.93, 0.87, 0.72, 0.72)
## A quest with every objective done and nowhere to hand it back yet.
const READY := Color(0.72, 0.86, 0.5, 0.95)

var _column: VBoxContainer


func _ready() -> void:
	layer = 7
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_column = VBoxContainer.new()
	_column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_column.anchor_left = 1.0
	_column.anchor_right = 1.0
	_column.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_column.add_theme_constant_override("separation", 4)
	root.add_child(_column)

	get_viewport().size_changed.connect(_fit)
	Quests.accepted.connect(_on_changed)
	Quests.advanced.connect(_on_step)
	Quests.completed.connect(_on_changed)
	Quests.turned_in.connect(_on_handed)
	_fit()
	_rebuild()


func _fit() -> void:
	var view := get_viewport().get_visible_rect().size
	var scale := clampf(view.y / LAYOUT_HEIGHT, SCALE_RANGE.x, SCALE_RANGE.y)
	_column.offset_left = -(WIDTH + MARGIN.x) * scale
	_column.offset_right = -MARGIN.x * scale
	_column.offset_top = MARGIN.y * scale


## Said as well as shown. The tracker changing is easy to miss on a screen with a river on
## it, and a job taken on ought to land.
func _on_changed(ref: String) -> void:
	var title := str(Quests.definition(ref).get("title", ref))
	if Quests.status(ref) == Quests.Status.COMPLETE:
		Toast.good(I18n.t("quest.done", {"title": title}))
	else:
		Toast.info(I18n.t("quest.taken", {"title": title}))
	_rebuild()


func _on_step(_ref: String, _step_id: String) -> void:
	_rebuild()


func _on_handed(ref: String, rewards: Dictionary) -> void:
	var title := str(Quests.definition(ref).get("title", ref))
	Toast.good(I18n.t("quest.handed", {"title": title}))
	var experience := int(rewards.get("xp", 0))
	if experience > 0:
		Toast.info(I18n.t("quest.reward_xp", {"amount": str(experience)}))
	_rebuild()


func _rebuild() -> void:
	for child in _column.get_children():
		_column.remove_child(child)
		child.queue_free()

	var in_hand := Quests.active()
	visible = not in_hand.is_empty()
	if in_hand.is_empty():
		return

	_column.add_child(_line(I18n.t("quest.tracker"), HEADING_FONT, HEADING))
	for quest in in_hand:
		var ref := str(quest["ref"])
		_column.add_child(_line(str(quest["title"]), TITLE_FONT, TITLE))
		var step := Quests.step(ref)
		if step.is_empty():
			## Everything done, nothing left to do but go back to whoever asked.
			_column.add_child(_line(I18n.t("quest.ready"), STEP_FONT, READY))
			continue
		for objective: Dictionary in step["objectives"]:
			var wanted := int(objective["amount"])
			var have := Quests.progress(ref, str(objective["id"]))
			var text := str(objective["description"])
			if wanted > 1:
				text = "%s  (%d/%d)" % [text, have, wanted]
			_column.add_child(_line(text, STEP_FONT, STEP))


func _line(text: String, font: int, tint: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font)
	label.add_theme_color_override("font_color", tint)
	label.add_theme_constant_override("outline_size", 4)
	label.add_theme_color_override("font_outline_color", Color(0.06, 0.045, 0.035, 0.85))
	return label
