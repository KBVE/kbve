extends CanvasLayer

@export var species: BirdSpecies

## In the world this menu owns the escape key and hands the mouse back to the camera on
## close.
var toggles_on_cancel := true
var captures_mouse_on_close := true
## Log Off would be a button back to the screen it is already on, so the title screen
## turns the session pair off and keeps its own Quit.
var shows_session_actions := true

var _root: Control
var _main_panel: VBoxContainer
var _settings_panel: VBoxContainer
var _graphics_panel: Control
var _gameplay_panel: Control
var _wardrobe_panel: Control
var _wardrobe_pages: Array[MenuPage] = []
var _gfx
var _gfx_pages: Array[MenuPage] = []
var _play
var _play_pages: Array[MenuPage] = []
var _codex_panel: HBoxContainer
var _book_anim: AnimationPlayer
var _book_anim_name := ""
var _book_root: Node3D
var _book_cam: Camera3D
var _book_vp: SubViewport
var _book_warm_light: OmniLight3D
var _book_base: Transform3D
var _book_start: Transform3D
var _transition := 0
## Touch needs a bigger hit target than a mouse cursor, and the book pages are a smaller
## share of a phone screen, so sizes come from here rather than being hardcoded per
## control.
var _touch := false

const TITLE_SCENE := "res://scenes/title.tscn"
const BOOK_MODEL := preload("res://assets/ui/book/book.glb")
const BOOK_OPEN_POSE := 1.6
const CLOSE_SPEED := 3.0


## Q_CODEX=1 opens straight into it, which is how the Codex gets looked at while it is
## being worked on.
func _open_codex_on_start() -> void:
	if OS.get_environment("Q_CODEX") == "":
		return
	await get_tree().process_frame
	_open()
	_open_codex()


func _ready() -> void:
	_open_codex_on_start.call_deferred()
	layer = 120
	process_mode = Node.PROCESS_MODE_ALWAYS
	MenuStyle.detect()
	_touch = MenuStyle.touch
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.visible = false
	add_child(_root)

	var dim := ColorRect.new()
	dim.color = Color(0.05, 0.04, 0.08, 0.6)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(dim)

	_build_book()

	_main_panel = _menu_box(0.40)
	_add_button(_main_panel, I18n.t("action.play"), _close)
	_add_button(_main_panel, I18n.t("action.settings"), func() -> void: _show(_settings_panel))
	if shows_session_actions:
		_add_button(_main_panel, I18n.t("pause.log_off"), _log_off)
		_add_button(_main_panel, I18n.t("action.quit"), _quit)

	_settings_panel = _menu_box(0.60)
	_add_button(_settings_panel, I18n.t("settings.graphics"), func() -> void: _show(_graphics_panel))
	_add_button(_settings_panel, I18n.t("settings.gameplay"), func() -> void: _show(_gameplay_panel))
	_add_button(_settings_panel, I18n.t("wardrobe.title"), func() -> void: _show(_wardrobe_panel))
	_add_button(_settings_panel, I18n.t("settings.codex"), _open_codex)
	_add_button(_settings_panel, I18n.t("action.back"), func() -> void: _show(_main_panel))

	_build_graphics()
	_build_gameplay()
	_build_wardrobe()

	_codex_panel = HBoxContainer.new()
	_codex_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_codex_panel.visible = false
	_root.add_child(_codex_panel)


func _build_book() -> void:
	var vp := SubViewport.new()
	vp.own_world_3d = true
	vp.transparent_bg = true
	vp.msaa_3d = Viewport.MSAA_2X
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(vp)
	_book_vp = vp

	var screen := TextureRect.new()
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	screen.stretch_mode = TextureRect.STRETCH_SCALE
	screen.texture = vp.get_texture()
	_root.add_child(screen)

	var fit := func() -> void:
		var canvas := Vector2(_root.size)
		var s: Vector2 = get_viewport().get_screen_transform().get_scale()
		var px := (canvas * s).round()
		var shrink := minf(1.0, minf(4096.0 / px.x, 4096.0 / px.y))
		px = (px * shrink).round()
		px.x = maxf(px.x, 64.0)
		px.y = maxf(px.y, 64.0)
		if Vector2i(px) != vp.size:
			vp.size = Vector2i(px)
		_layout_pages()
	get_window().size_changed.connect(fit, CONNECT_DEFERRED)
	fit.call_deferred()

	var world := Node3D.new()
	vp.add_child(world)
	var wenv := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_CLEAR_COLOR
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(1.0, 1.0, 1.0)
	e.ambient_light_energy = 0.8
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	e.tonemap_exposure = 0.92
	e.ssao_enabled = true
	e.ssao_intensity = 1.5
	e.ssao_radius = 0.3
	wenv.environment = e
	world.add_child(wenv)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-35, 40, 0)
	key.light_energy = 1.0
	key.shadow_enabled = true
	key.shadow_blur = 1.0
	world.add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-35, -40, 0)
	fill.light_energy = 0.65
	world.add_child(fill)
	var warm := OmniLight3D.new()
	warm.light_color = Color(1.0, 0.93, 0.8)
	warm.light_energy = 1.2
	warm.omni_range = 3.0
	world.add_child(warm)
	_book_warm_light = warm

	_book_root = BOOK_MODEL.instantiate()
	world.add_child(_book_root)
	_soften_materials(_book_root)
	_book_root.rotation.x = PI / 2.0
	_book_anim = _find_anim(_book_root)
	if _book_anim and _book_anim.get_animation_list().size() > 0:
		_book_anim_name = _book_anim.get_animation_list()[0]

	var aabb := _model_aabb(_book_root)
	var cam := Camera3D.new()
	world.add_child(cam)
	_book_cam = cam
	var dist := maxf(aabb.size.length(), 0.3) * 1.45
	cam.fov = 50.0
	cam.look_at_from_position(aabb.get_center() + Vector3(0, dist * 0.06, dist), aabb.get_center())
	_book_warm_light.position = aabb.get_center() + Vector3(0.0, dist * 0.7, dist * 0.4)

	_book_base = _book_root.transform
	_book_start = _book_base.scaled_local(Vector3.ONE * 0.06)
	_book_start.basis = Basis(Vector3(1, 0, 0), -0.85) * _book_start.basis
	_book_start.origin += Vector3(0.0, -dist * 0.42, -dist * 1.7)


func _soften_materials(node: Node) -> void:
	var mi := node as MeshInstance3D
	if mi and mi.mesh:
		for i in mi.mesh.get_surface_count():
			var m := mi.mesh.surface_get_material(i) as BaseMaterial3D
			if m:
				m = m.duplicate()
				m.roughness = 1.0
				m.metallic = 0.0
				m.metallic_specular = 0.0
				m.normal_scale = 0.35
				mi.set_surface_override_material(i, m)
	for child in node.get_children():
		_soften_materials(child)


func _find_anim(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_anim(child)
		if found:
			return found
	return null


## Split across both open pages rather than one tall centred column: six rows grow from
## the middle in both directions and run off the top of the book.
func _build_graphics() -> void:
	_graphics_panel = Control.new()
	_graphics_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_graphics_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_graphics_panel.visible = false
	_root.add_child(_graphics_panel)

	_gfx = get_parent().get_node_or_null("GraphicsSettings") if get_parent() else null
	var left := MenuPage.make(MenuStyle.Side.LEFT, _graphics_panel)
	var right := MenuPage.make(MenuStyle.Side.RIGHT, _graphics_panel)
	left.pair_with(right)
	_gfx_pages = [left, right]
	if _gfx == null:
		_page_back(right)
		return

	left.add_cycler(I18n.t("settings.quality" if _touch else "settings.preset"),
			func() -> Array: return I18n.t_all(_gfx.PRESET_NAMES),
			func() -> int: return _gfx.preset_index(),
			func(i: int) -> void: _gfx.apply_preset(i),
			_gfx.TIERS.size())

	if _touch:
		_page_back(right)
		return

	left.add_cycler(I18n.t("settings.ground_detail"),
			func() -> Array: return I18n.t_all(_gfx.DETAIL_NAMES),
			func() -> int: return _gfx.detail,
			func(i: int) -> void:
				_gfx.detail = i
				_gfx.apply(),
			_gfx.DETAIL_NAMES.size())

	left.add_cycler(I18n.t("settings.resolution"),
			func() -> Array: return ["50%", "60%", "70%", "85%", "100%"],
			func() -> int: return _nearest_scale(_gfx.render_scale),
			func(i: int) -> void:
				_gfx.render_scale = SCALE_STEPS[i]
				_gfx.apply(),
			SCALE_STEPS.size())

	right.add_cycler(I18n.t("settings.shadows"),
			func() -> Array: return _off_on(),
			func() -> int: return 1 if _gfx.shadows else 0,
			func(i: int) -> void:
				_gfx.shadows = i == 1
				_gfx.apply(),
			2)

	right.add_cycler(I18n.t("settings.grass"),
			func() -> Array: return _grass_labels(),
			func() -> int: return _nearest(_gfx.GRASS_STEPS, _gfx.grass_blades),
			func(i: int) -> void:
				_gfx.grass_blades = _gfx.GRASS_STEPS[i]
				_gfx.apply(),
			_gfx.GRASS_STEPS.size())

	right.add_cycler(I18n.t("settings.post_fx"),
			func() -> Array: return _off_on(),
			func() -> int: return 1 if _gfx.postfx else 0,
			func(i: int) -> void:
				_gfx.postfx = i == 1
				_gfx.apply(),
			2)

	_page_back(right)


func _build_gameplay() -> void:
	_gameplay_panel = Control.new()
	_gameplay_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_gameplay_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_gameplay_panel.visible = false
	_root.add_child(_gameplay_panel)

	_play = get_parent().get_node_or_null("GameplaySettings") if get_parent() else null
	var left := MenuPage.make(MenuStyle.Side.LEFT, _gameplay_panel)
	var right := MenuPage.make(MenuStyle.Side.RIGHT, _gameplay_panel)
	left.pair_with(right)
	_play_pages = [left, right]
	if _play == null:
		_page_back(right)
		return

	left.add_cycler(I18n.t("settings.camera"),
			func() -> Array: return I18n.t_all(_play.CAMERA_NAMES),
			func() -> int: return _play.camera_mode,
			func(i: int) -> void: _play.set_camera_mode(i),
			_play.CAMERA_NAMES.size())

	right.add_cycler(I18n.t("settings.crosshair"),
			func() -> Array: return _off_on(),
			func() -> int: return 1 if _play.crosshair else 0,
			func(i: int) -> void: _play.set_crosshair(i == 1),
			2)

	if not shows_session_actions:
		left.add_cycler(I18n.t("settings.language"),
				func() -> Array: return I18n.locale_names(),
				func() -> int: return I18n.locale_index(),
				func(i: int) -> void: _switch_locale(i),
				I18n.locales().size())

	_page_back(right)


## The player's own wardrobe: one row per slot, cycling through what the kit has for it.
##
## Pieces are filtered to the set that fits the player's body. They all share one skeleton
## so any of them would attach, but a woman's cut on a man's frame reads as a mistake
## rather than a choice.
const WARDROBE_SEX := "Male"
const WARDROBE_SLOTS := [
	[&"head", "wardrobe.head"],
	[&"chest", "wardrobe.chest"],
	[&"hands", "wardrobe.hands"],
	[&"legs", "wardrobe.legs"],
	[&"feet", "wardrobe.feet"],
	[&"neck", "wardrobe.neck"],
	[&"back", "wardrobe.back"],
]


func _build_wardrobe() -> void:
	_wardrobe_panel = Control.new()
	_wardrobe_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_wardrobe_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_wardrobe_panel.visible = false
	_root.add_child(_wardrobe_panel)

	var left := MenuPage.make(MenuStyle.Side.LEFT, _wardrobe_panel)
	var right := MenuPage.make(MenuStyle.Side.RIGHT, _wardrobe_panel)
	left.pair_with(right)
	_wardrobe_pages = [left, right]

	var half := int(ceil(WARDROBE_SLOTS.size() / 2.0))
	for i in WARDROBE_SLOTS.size():
		var slot: StringName = WARDROBE_SLOTS[i][0]
		var page: MenuPage = left if i < half else right
		var choices := _wardrobe_choices(slot)
		page.add_cycler(I18n.t(str(WARDROBE_SLOTS[i][1])),
				func() -> Array: return _wardrobe_names(slot),
				func() -> int: return maxi(choices.find(Journal.worn_in(slot)), 0),
				func(pick: int) -> void: _wear(slot, choices[pick] if pick < choices.size() else &""),
				choices.size())
	_page_back(right)


## Everything that fits the slot, with nothing at the front -- taking a thing off has to
## be as reachable as putting one on.
func _wardrobe_choices(slot: StringName) -> Array[StringName]:
	var out: Array[StringName] = [&""]
	for id: StringName in Wardrobe.all():
		var piece: Dictionary = Wardrobe.piece(id)
		if piece[&"slot"] == slot and piece[&"sex"] == WARDROBE_SEX:
			out.append(id)
	return out


func _wardrobe_names(slot: StringName) -> Array:
	var out: Array = []
	for id: StringName in _wardrobe_choices(slot):
		out.append(I18n.t("wardrobe.none") if id == &"" else _wardrobe_label(id))
	return out


## `Male_Ranger_Head_Hood` reads as "Ranger Hood": the set it belongs to, and what it
## actually is. The slot is already the row's own label.
func _wardrobe_label(id: StringName) -> String:
	var piece: Dictionary = Wardrobe.piece(id)
	var variant := str(piece.get(&"variant", ""))
	var what := variant if variant != "" else str(piece.get(&"part", ""))
	return "%s %s" % [piece.get(&"outfit", ""), what.replace("_", " ")]


func _wear(slot: StringName, id: StringName) -> void:
	if id == &"":
		Journal.take_off(slot)
	else:
		Journal.wear(id)


func _switch_locale(index: int) -> void:
	if index == I18n.locale_index():
		return
	I18n.set_locale_index(index, true)
	_transition += 1
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	get_tree().reload_current_scene()


func _page_back(page: MenuPage) -> PaperButton:
	return page.add_button(I18n.t("action.back"), func() -> void: _show(_settings_panel))


func _off_on() -> Array:
	return [I18n.t("toggle.off"), I18n.t("toggle.on")]


const SCALE_STEPS := [0.5, 0.6, 0.7, 0.85, 1.0]

## Page rects, touch padding and row sizing all moved to MenuStyle -- the pages are the
## only thing that reads them, and MenuPage applies them in its layout pass.


func _book_rect() -> Rect2:
	if _book_cam == null or _book_root == null or _book_vp == null:
		return Rect2()
	var vp_size := Vector2(_book_vp.size)
	if vp_size.x <= 0.0 or vp_size.y <= 0.0:
		return Rect2()
	var aabb := _model_aabb(_book_root)
	if aabb.size == Vector3.ZERO:
		return Rect2()
	var mn := Vector2(INF, INF)
	var mx := Vector2(-INF, -INF)
	for i in 8:
		var p := _book_cam.unproject_position(aabb.get_endpoint(i)) / vp_size
		mn = mn.min(p)
		mx = mx.max(p)
	return Rect2(mn, mx - mn)


## Anchors and row metrics both come off the projected book, so a resize re-flows the
## pages instead of sliding them off the paper.
func _layout_pages() -> void:
	var book := _book_rect()
	if book.size.x <= 0.0 or book.size.y <= 0.0:
		return
	var debug := OS.get_environment("Q_BOOK_RECT") != ""
	if debug:
		print("[book] rect %s  root %s  vp %s" % [book, _root.size, _book_vp.size])

	var metrics := MenuStyle.row_metrics(book.size.y, _root.size.y)
	for page in _gfx_pages + _play_pages + _wardrobe_pages:
		page.layout(book, metrics)
		if debug:
			print("[book] page %.3f %.3f %.3f %.3f" % [page.anchor_left, page.anchor_top,
					page.anchor_right - page.anchor_left, page.anchor_bottom - page.anchor_top])


func _nearest_scale(v: float) -> int:
	return _nearest(SCALE_STEPS, v)


## Blades per square metre, shown as the number rather than a percentage: the field
## default has already moved 250 -> 150, and a percentage would have meant a different
## density either side of that.
func _grass_labels() -> Array:
	var out: Array = []
	for v in _gfx.GRASS_STEPS:
		out.append(I18n.t("settings.grass_density", {"count": int(v)}))
	return out


func _nearest(steps: Array, v: float) -> int:
	var best := 0
	var best_d := 1e9
	for i in steps.size():
		var d: float = absf(float(steps[i]) - v)
		if d < best_d:
			best_d = d
			best = i
	return best


## One row, cycled by clicking rather than a dropdown: every option here is a short
## ordered list, and a Button is already themed to match the book.
func _menu_box(page_x: float = 0.5, page_y: float = 0.5) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.anchor_left = page_x
	box.anchor_right = page_x
	box.anchor_top = page_y
	box.anchor_bottom = page_y
	box.grow_horizontal = Control.GROW_DIRECTION_BOTH
	box.grow_vertical = Control.GROW_DIRECTION_BOTH
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 14)
	box.visible = false
	_root.add_child(box)
	return box


func _add_button(parent: Container, text: String, action: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(220, 48)
	b.add_theme_font_size_override("font_size", 22)
	b.add_theme_color_override("font_color", Color(0.25, 0.16, 0.08))
	b.add_theme_color_override("font_hover_color", Color(0.45, 0.2, 0.05))
	b.add_theme_color_override("font_pressed_color", Color(0.1, 0.06, 0.03))
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.93, 0.87, 0.72, 0.55)
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	b.add_theme_stylebox_override("normal", style)
	var hover := style.duplicate() as StyleBoxFlat
	hover.bg_color = Color(0.97, 0.9, 0.72, 0.8)
	b.add_theme_stylebox_override("hover", hover)
	var pressed := style.duplicate() as StyleBoxFlat
	pressed.bg_color = Color(0.8, 0.72, 0.55, 0.85)
	b.add_theme_stylebox_override("pressed", pressed)
	b.pressed.connect(action)
	parent.add_child(b)
	return b


func _input(event: InputEvent) -> void:
	if not toggles_on_cancel:
		return
	if event.is_action_pressed("ui_cancel"):
		if _root.visible:
			_close()
		else:
			_open()
		get_viewport().set_input_as_handled()


func is_open() -> bool:
	return _root != null and _root.visible


func close() -> void:
	_close()


## Opens straight onto the settings pages.
func open_settings() -> void:
	await _open()
	if _root.visible:
		_show(_settings_panel)


func _open() -> void:
	get_tree().paused = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_root.visible = true
	_set_crosshair(false)
	_show(null)
	if _book_anim and _book_anim_name != "":
		_transition += 1
		var token := _transition
		_book_root.transform = _book_start
		var tw := create_tween()
		tw.tween_property(_book_root, "transform", _book_base, 1.0).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		_book_anim.speed_scale = 1.0
		_book_anim.play(_book_anim_name)
		await get_tree().create_timer(BOOK_OPEN_POSE, true, false, true).timeout
		if token != _transition or not _root.visible:
			return
		_book_anim.pause()
	_show(_main_panel)


func _close() -> void:
	_transition += 1
	var token := _transition
	_show(null)
	if _book_anim and _book_anim_name != "":
		var pos := _book_anim.current_animation_position if _book_anim.current_animation != "" else BOOK_OPEN_POSE
		_book_anim.speed_scale = CLOSE_SPEED
		_book_anim.play_backwards(_book_anim_name)
		await get_tree().create_timer(maxf(pos / CLOSE_SPEED, 0.1), true, false, true).timeout
		if token != _transition:
			return
		_book_anim.stop()
		var tw := create_tween()
		tw.tween_property(_book_root, "transform", _book_start, 0.45).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		await get_tree().create_timer(0.45, true, false, true).timeout
		if token != _transition:
			return
	get_tree().paused = false
	Input.mouse_mode = (Input.MOUSE_MODE_CAPTURED if captures_mouse_on_close
			else Input.MOUSE_MODE_VISIBLE)
	_root.visible = false
	_set_crosshair(true)


## Leaves without the book's close animation: the scene it is animating on top of is
## about to be freed, and an awaited tween there is a tween that resumes against a dead
## node.
func _log_off() -> void:
	_transition += 1
	_show(null)
	_root.visible = false
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_leave_session()
	get_tree().change_scene_to_file(TITLE_SCENE)


func _quit() -> void:
	_transition += 1
	_show(null)
	_root.visible = false
	get_tree().paused = false
	_leave_session()
	get_tree().quit()


## The server keeps a body for a peer that vanished without saying so, so both paths out
## hand the connection back before the scene or the process goes.
func _leave_session() -> void:
	for node in get_tree().root.find_children("*", "NetGameClient", true, false):
		node.disconnect_from_server()
	if multiplayer.multiplayer_peer != null:
		multiplayer.multiplayer_peer.close()
		multiplayer.multiplayer_peer = null


func _set_crosshair(shown: bool) -> void:
	var hud := get_parent().get_node_or_null("Crosshair") if get_parent() else null
	if hud:
		hud.visible = shown and (_play == null or _play.crosshair)


func _show(panel: Control) -> void:
	if panel == null:
		_main_panel.visible = false
		_settings_panel.visible = false
		_graphics_panel.visible = false
		_gameplay_panel.visible = false
		_wardrobe_panel.visible = false
		_codex_panel.visible = false
		return
	if panel == _graphics_panel or panel == _gameplay_panel or panel == _wardrobe_panel:
		_layout_pages()
	if panel == _graphics_panel:
		for page in _gfx_pages:
			page.refresh()
	if panel == _gameplay_panel:
		for page in _play_pages:
			page.refresh()
	if panel == _wardrobe_panel:
		for page in _wardrobe_pages:
			page.refresh()
	_main_panel.visible = panel == _main_panel
	_settings_panel.visible = panel == _settings_panel
	_graphics_panel.visible = panel == _graphics_panel
	_gameplay_panel.visible = panel == _gameplay_panel
	_wardrobe_panel.visible = panel == _wardrobe_panel
	_codex_panel.visible = panel == _codex_panel


func _open_codex() -> void:
	if _codex_panel.get_child_count() == 0:
		_build_codex()
	_show(_codex_panel)


func _build_codex() -> void:
	var codex := HBoxContainer.new()
	codex.set_script(preload("res://src/ui/codex.gd"))
	codex.set_anchors_preset(Control.PRESET_FULL_RECT)
	codex.on_back = func() -> void: _show(_settings_panel)
	_codex_panel.add_child(codex)


func _model_aabb(root: Node) -> AABB:
	var result := AABB()
	var first := true
	var stack := [root]
	while stack.size() > 0:
		var n: Node = stack.pop_back()
		if n is MeshInstance3D:
			var b: AABB = (n as MeshInstance3D).global_transform * (n as MeshInstance3D).get_aabb()
			result = b if first else result.merge(b)
			first = false
		stack.append_array(n.get_children())
	return result
