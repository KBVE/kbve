class_name LoadingScreen
extends CanvasLayer

## The screen that stands in front of a scene swap.

const BACKDROP := Color(0.07, 0.06, 0.05, 1.0)
const BAR_SIZE := Vector2(360, 10)
const BAR_TRACK := Color(0.2, 0.16, 0.12, 0.9)

## Frames to hold after the swap.
const HOLD_FRAMES := 3

var _label: Label
var _fill: ColorRect
var _percent: Label


## Swaps to `path` behind a cover that keeps drawing while the load runs.
static func swap(tree: SceneTree, path: String, what: String = "") -> LoadingScreen:
	var screen := LoadingScreen.new()
	screen.name = "LoadingScreen"
	tree.root.add_child(screen)
	screen._build()
	screen._run(tree, path, what)
	return screen


func _init() -> void:
	layer = 200
	process_mode = Node.PROCESS_MODE_ALWAYS


func _ready() -> void:
	_build()


func _build() -> void:
	if _label != null:
		return
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(root)

	var backdrop := ColorRect.new()
	backdrop.color = BACKDROP
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(backdrop)

	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 14)
	column.anchor_left = 0.5
	column.anchor_right = 0.5
	column.anchor_top = 0.5
	column.anchor_bottom = 0.5
	column.grow_horizontal = Control.GROW_DIRECTION_BOTH
	column.grow_vertical = Control.GROW_DIRECTION_BOTH
	root.add_child(column)

	_label = Label.new()
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.add_theme_font_size_override("font_size", 28)
	_label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	column.add_child(_label)

	var track := ColorRect.new()
	track.color = BAR_TRACK
	track.custom_minimum_size = BAR_SIZE
	track.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	column.add_child(track)

	_fill = ColorRect.new()
	_fill.color = MenuStyle.PAPER_HOVER
	_fill.anchor_top = 0.0
	_fill.anchor_bottom = 1.0
	_fill.anchor_left = 0.0
	_fill.anchor_right = 0.0
	_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track.add_child(_fill)

	_percent = Label.new()
	_percent.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_percent.add_theme_font_size_override("font_size", 14)
	_percent.add_theme_color_override("font_color", MenuStyle.PAPER)
	column.add_child(_percent)


func _run(tree: SceneTree, path: String, what: String) -> void:
	_build()
	_label.text = "Loading %s" % what if what != "" else "Loading"

	var err := ResourceLoader.load_threaded_request(path, "PackedScene")
	if err != OK:
		push_error("[LoadingScreen] cannot request %s (%d); loading it blocking" % [path, err])
		tree.change_scene_to_file(path)
		queue_free()
		return

	var progress: Array = []
	while true:
		var status := ResourceLoader.load_threaded_get_status(path, progress)
		if status == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			_set_progress(float(progress[0]) if not progress.is_empty() else 0.0)
			await tree.process_frame
			continue
		if status == ResourceLoader.THREAD_LOAD_LOADED:
			break
		push_error("[LoadingScreen] load of %s failed (status %d)" % [path, status])
		tree.change_scene_to_file(path)
		queue_free()
		return

	_set_progress(1.0)
	var packed := ResourceLoader.load_threaded_get(path) as PackedScene
	if packed == null:
		push_error("[LoadingScreen] %s did not load as a PackedScene" % path)
		tree.change_scene_to_file(path)
		queue_free()
		return

	tree.change_scene_to_packed(packed)
	for _i in HOLD_FRAMES:
		await tree.process_frame
	queue_free()


func _set_progress(ratio: float) -> void:
	var clamped := clampf(ratio, 0.0, 1.0)
	_fill.anchor_right = clamped
	_percent.text = "%d%%" % int(round(clamped * 100.0))
