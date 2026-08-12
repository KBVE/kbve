extends CanvasLayer

@export var species: BirdSpecies

var _root: Control
var _main_panel: VBoxContainer
var _settings_panel: VBoxContainer
var _graphics_panel: VBoxContainer
var _gfx
var _gfx_rows: Array[Callable] = []
var _codex_panel: HBoxContainer
var _preview_model: Node3D
var _preview_pivot: Node3D
var _yaw_slider: HSlider
var _pitch_slider: HSlider
var _fix_label: Label
var _book_anim: AnimationPlayer
var _book_anim_name := ""
var _book_root: Node3D
var _book_warm_light: OmniLight3D
var _book_base: Transform3D
var _book_start: Transform3D
var _transition := 0

const BOOK_MODEL := preload("res://assets/ui/book/book.glb")
const BOOK_OPEN_POSE := 1.6
const CLOSE_SPEED := 3.0


func _ready() -> void:
	layer = 120
	process_mode = Node.PROCESS_MODE_ALWAYS
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
	_add_button(_main_panel, "Play", _close)
	_add_button(_main_panel, "Settings", func() -> void: _show(_settings_panel))

	_settings_panel = _menu_box(0.60)
	_add_button(_settings_panel, "Graphics", func() -> void: _show(_graphics_panel))
	_add_button(_settings_panel, "Codex", _open_codex)
	_add_button(_settings_panel, "Back", func() -> void: _show(_main_panel))

	_build_graphics()

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


## Options are ordered by measured cost, worst first, and each carries its price
## so the choice is informed rather than a guess about what "High" means.
func _build_graphics() -> void:
	_graphics_panel = _menu_box(0.60)
	_gfx = get_parent().get_node_or_null("GraphicsSettings") if get_parent() else null
	if _gfx == null:
		_add_button(_graphics_panel, "Back", func() -> void: _show(_settings_panel))
		return

	_gfx_rows.append(_add_cycler(_graphics_panel, "Preset",
			func() -> Array: return _gfx.PRESET_NAMES,
			func() -> int: return _gfx.preset_index(),
			func(i: int) -> void: _gfx.apply_preset(i),
			_gfx.PRESETS.size()))

	_gfx_rows.append(_add_cycler(_graphics_panel, "Ground Detail",
			func() -> Array: return _gfx.DETAIL_NAMES,
			func() -> int: return _gfx.detail,
			func(i: int) -> void:
				_gfx.detail = i
				_gfx.apply(),
			_gfx.DETAIL_NAMES.size()))

	_gfx_rows.append(_add_cycler(_graphics_panel, "Resolution",
			func() -> Array: return ["50%", "60%", "70%", "85%", "100%"],
			func() -> int: return _nearest_scale(_gfx.render_scale),
			func(i: int) -> void:
				_gfx.render_scale = SCALE_STEPS[i]
				_gfx.apply(),
			SCALE_STEPS.size()))

	_gfx_rows.append(_add_cycler(_graphics_panel, "Shadows",
			func() -> Array: return ["Off", "On"],
			func() -> int: return 1 if _gfx.shadows else 0,
			func(i: int) -> void:
				_gfx.shadows = i == 1
				_gfx.apply(),
			2))

	_gfx_rows.append(_add_cycler(_graphics_panel, "Grass",
			func() -> Array: return ["25%", "50%", "75%", "100%"],
			func() -> int: return _nearest_grass(_gfx.grass_density),
			func(i: int) -> void:
				_gfx.grass_density = GRASS_STEPS[i]
				_gfx.apply(),
			GRASS_STEPS.size()))

	_gfx_rows.append(_add_cycler(_graphics_panel, "Post FX",
			func() -> Array: return ["Off", "On"],
			func() -> int: return 1 if _gfx.postfx else 0,
			func(i: int) -> void:
				_gfx.postfx = i == 1
				_gfx.apply(),
			2))

	_add_button(_graphics_panel, "Back", func() -> void: _show(_settings_panel))


const SCALE_STEPS := [0.5, 0.6, 0.7, 0.85, 1.0]
const GRASS_STEPS := [0.25, 0.5, 0.75, 1.0]


func _nearest_scale(v: float) -> int:
	return _nearest(SCALE_STEPS, v)


func _nearest_grass(v: float) -> int:
	return _nearest(GRASS_STEPS, v)


func _nearest(steps: Array, v: float) -> int:
	var best := 0
	var best_d := 1e9
	for i in steps.size():
		var d: float = absf(float(steps[i]) - v)
		if d < best_d:
			best_d = d
			best = i
	return best


## One row, cycled by clicking rather than a dropdown: every option here is a
## short ordered list, and a Button is already themed to match the book.
func _add_cycler(parent: Container, label: String, names: Callable, get_index: Callable,
		set_index: Callable, count: int) -> Callable:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var name_label := Label.new()
	name_label.text = label
	name_label.custom_minimum_size = Vector2(150, 0)
	name_label.add_theme_font_size_override("font_size", 18)
	name_label.add_theme_color_override("font_color", Color(0.25, 0.16, 0.08))
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(name_label)
	var value_button := _add_button(row, "", func() -> void: pass)
	value_button.custom_minimum_size = Vector2(150, 40)
	var refresh := func() -> void:
		var list: Array = names.call()
		var i: int = clampi(get_index.call(), 0, list.size() - 1)
		value_button.text = str(list[i])
	value_button.pressed.connect(func() -> void:
		var i: int = (get_index.call() + 1) % count
		set_index.call(i)
		for r in _gfx_rows:
			r.call())
	refresh.call()
	parent.add_child(row)
	return refresh


func _menu_box(page_x: float = 0.5) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.anchor_left = page_x
	box.anchor_right = page_x
	box.anchor_top = 0.5
	box.anchor_bottom = 0.5
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
	if event.is_action_pressed("ui_cancel"):
		if _root.visible:
			_close()
		else:
			_open()
		get_viewport().set_input_as_handled()


func _open() -> void:
	get_tree().paused = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_root.visible = true
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
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_root.visible = false


func _show(panel: Control) -> void:
	if panel == null:
		_main_panel.visible = false
		_settings_panel.visible = false
		_graphics_panel.visible = false
		_codex_panel.visible = false
		return
	if panel == _graphics_panel:
		for r in _gfx_rows:
			r.call()
	_main_panel.visible = panel == _main_panel
	_settings_panel.visible = panel == _settings_panel
	_graphics_panel.visible = panel == _graphics_panel
	_codex_panel.visible = panel == _codex_panel


func _open_codex() -> void:
	if _codex_panel.get_child_count() == 0:
		_build_codex()
	_show(_codex_panel)


func _build_codex() -> void:
	var viewport_box := SubViewportContainer.new()
	viewport_box.stretch = true
	viewport_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	viewport_box.size_flags_stretch_ratio = 1.2
	_codex_panel.add_child(viewport_box)

	var vp := SubViewport.new()
	vp.own_world_3d = true
	vp.transparent_bg = false
	vp.msaa_3d = Viewport.MSAA_4X
	viewport_box.add_child(vp)

	var world := Node3D.new()
	vp.add_child(world)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.55, 0.58, 0.66)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.85, 0.85, 0.9)
	e.ambient_light_energy = 1.4
	env.environment = e
	world.add_child(env)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-40, 35, 0)
	key.light_energy = 1.6
	world.add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-15, -120, 0)
	fill.light_energy = 0.8
	fill.light_color = Color(0.9, 0.92, 1.0)
	world.add_child(fill)
	var back := DirectionalLight3D.new()
	back.rotation_degrees = Vector3(30, 180, 0)
	back.light_energy = 1.0
	world.add_child(back)

	_preview_pivot = Node3D.new()
	world.add_child(_preview_pivot)
	_preview_model = species.model.instantiate()
	_preview_pivot.add_child(_preview_model)
	_preview_model.scale = Vector3.ONE * species.scale
	_preview_model.rotation.y = species.model_yaw_fix
	_preview_model.rotation.x = species.model_pitch_fix

	var aabb := _model_aabb(_preview_model)
	var cam := Camera3D.new()
	world.add_child(cam)
	var dist := maxf(aabb.size.length(), 0.5) * 1.1
	cam.look_at_from_position(Vector3(dist, aabb.size.y * 0.45, dist), aabb.get_center())

	var arrow := MeshInstance3D.new()
	var arrow_mesh := BoxMesh.new()
	arrow_mesh.size = Vector3(0.02, 0.02, aabb.size.length())
	arrow.mesh = arrow_mesh
	arrow.position = aabb.get_center() + Vector3(0, -aabb.size.y * 0.6, arrow_mesh.size.z * 0.5)
	var arrow_mat := StandardMaterial3D.new()
	arrow_mat.albedo_color = Color(1.0, 0.4, 0.2)
	arrow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	arrow.material_override = arrow_mat
	world.add_child(arrow)

	var side_panel := PanelContainer.new()
	side_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.08, 0.12, 0.95)
	style.content_margin_left = 16.0
	style.content_margin_right = 16.0
	style.content_margin_top = 12.0
	style.content_margin_bottom = 12.0
	side_panel.add_theme_stylebox_override("panel", style)
	_codex_panel.add_child(side_panel)

	var side := VBoxContainer.new()
	side.add_theme_constant_override("separation", 10)
	side_panel.add_child(side)

	var info := RichTextLabel.new()
	info.bbcode_enabled = true
	info.size_flags_vertical = Control.SIZE_EXPAND_FILL
	info.add_theme_font_size_override("normal_font_size", 16)
	info.add_theme_font_size_override("bold_font_size", 18)
	info.text = _species_report(aabb)
	side.add_child(info)

	_fix_label = Label.new()
	_fix_label.add_theme_font_size_override("font_size", 18)
	_fix_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.4))
	side.add_child(_fix_label)

	_yaw_slider = _add_slider(side, "yaw fix", -PI, PI, species.model_yaw_fix)
	_pitch_slider = _add_slider(side, "pitch fix", -PI * 0.5, PI * 0.5, species.model_pitch_fix)
	_update_fix()

	_add_button(side, "Back", func() -> void: _show(_settings_panel))


func _add_slider(parent: Container, label: String, from: float, to: float, value: float) -> HSlider:
	var l := Label.new()
	l.text = label
	l.add_theme_font_size_override("font_size", 16)
	parent.add_child(l)
	var s := HSlider.new()
	s.custom_minimum_size = Vector2(0, 28)
	s.min_value = from
	s.max_value = to
	s.step = 0.01
	s.value = value
	s.value_changed.connect(func(_v: float) -> void: _update_fix())
	parent.add_child(s)
	return s


func _update_fix() -> void:
	var yaw := _yaw_slider.value
	var pitch := _pitch_slider.value
	_preview_model.rotation.y = yaw
	_preview_model.rotation.x = pitch
	_fix_label.text = "model_yaw_fix = %.2f   model_pitch_fix = %.2f" % [yaw, pitch]
	for flock in get_tree().get_nodes_in_group("flocks"):
		for bird in flock.get_children():
			if bird.get_child_count() > 0:
				var model := bird.get_child(0) as Node3D
				model.rotation.y = yaw
				model.rotation.x = pitch


func _species_report(aabb: AABB) -> String:
	var lines := []
	lines.append("[b]%s[/b]" % species.resource_path.get_file())
	lines.append("size: %.2f x %.2f x %.2f m (scale %.1f)" % [aabb.size.x, aabb.size.y, aabb.size.z, species.scale])
	lines.append("flap: speed %.1f  amount %.2f  axis %s" % [species.flap_speed, species.flap_amount, species.flap_axis])
	lines.append("orbit: r %.1f  h %.1f  speed %.2f" % [species.orbit_radius, species.orbit_height, species.orbit_speed])
	lines.append("orange line = flight direction (+Z of entity)")
	var sk := _find_skeleton(_preview_model)
	if sk:
		lines.append("\n[b]skeleton[/b]: %d bones" % sk.get_bone_count())
		for i in sk.get_bone_count():
			var rest := sk.get_bone_rest(i)
			lines.append("  %d %s  pos %s" % [i, sk.get_bone_name(i), "(%.2f, %.2f, %.2f)" % [rest.origin.x, rest.origin.y, rest.origin.z]])
	return "\n".join(lines)


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


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found:
			return found
	return null


func _process(_delta: float) -> void:
	if _codex_panel and _codex_panel.visible and _preview_pivot:
		_preview_pivot.rotation.y += 0.008
