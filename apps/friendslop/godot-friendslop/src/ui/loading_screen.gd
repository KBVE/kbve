class_name LoadingScreen
extends CanvasLayer


const BACKDROP := Color(0.07, 0.06, 0.05, 1.0)
const BAR_SIZE := Vector2(360, 10)
const BAR_TRACK := Color(0.2, 0.16, 0.12, 0.9)

const HOLD_FRAMES := 3
const BUILD_TIMEOUT := 25.0
const BUILD_PACE := 4.0

const WARM_TIMEOUT := 30.0
const WARM_CALM_FRAMES := 45

var _label: Label
var _fill: ColorRect
var _percent: Label


static func swap(tree: SceneTree, path: String, what: String = "") -> LoadingScreen:
	var screen := LoadingScreen.new()
	screen.name = "LoadingScreen"
	screen._build()
	screen._attach(tree, path, what)
	return screen


func _attach(tree: SceneTree, path: String, what: String) -> void:
	tree.root.add_child.call_deferred(self)
	if not is_node_ready():
		await ready
	_run(tree, path, what)


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
	await _wait_for_world(tree, what)
	await _warm_shaders(tree)
	queue_free()


func _wait_for_world(tree: SceneTree, what: String) -> void:
	var scene := tree.current_scene
	if scene == null or not scene.has_method("world_ready") or scene.world_ready():
		return
	_label.text = "Building %s" % what if what != "" else "Building the world"
	var started := Time.get_ticks_msec()
	while not scene.world_ready():
		var waited := (Time.get_ticks_msec() - started) / 1000.0
		if waited >= BUILD_TIMEOUT:
			push_warning("[LoadingScreen] %s still building after %.0fs; going in anyway" % [
					what, waited])
			return
		_set_progress(1.0 - exp(-waited / BUILD_PACE))
		await tree.process_frame
	_set_progress(1.0)


func _warm_shaders(tree: SceneTree) -> void:
	_label.text = "Compiling shaders"
	_set_progress(0.0)
	var started := Time.get_ticks_usec()
	var seen := _pipeline_compiles()
	var calm := 0
	while calm < WARM_CALM_FRAMES:
		await tree.process_frame
		var compiled := _pipeline_compiles()
		if compiled > seen:
			seen = compiled
			calm = 0
		else:
			calm += 1
		var waited := float(Time.get_ticks_usec() - started) / 1000000.0
		if waited >= WARM_TIMEOUT:
			push_warning("[LoadingScreen] shaders still compiling after %.0fs; going in anyway" % waited)
			return
		_set_progress(float(calm) / float(WARM_CALM_FRAMES))
	_set_progress(1.0)


func _pipeline_compiles() -> int:
	var total := 0
	for source in [RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_CANVAS,
			RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_MESH,
			RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_SURFACE,
			RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_DRAW,
			RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_SPECIALIZATION]:
		total += RenderingServer.get_rendering_info(source)
	return total


func _set_progress(ratio: float) -> void:
	var clamped := clampf(ratio, 0.0, 1.0)
	_fill.anchor_right = clamped
	_percent.text = "%d%%" % int(round(clamped * 100.0))
