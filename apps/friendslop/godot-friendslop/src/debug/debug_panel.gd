extends CanvasLayer

const TOGGLE_KEY := KEY_TAB

const LAYERS: Array[Dictionary] = [
	{"node": ^"../Terrain", "label": "Terrain (all)"},
	{"node": ^"../Terrain/Water", "label": "  \u21b3 water surface"},
	{"node": ^"../Terrain/Riverbed", "label": "  \u21b3 riverbed"},
	{"node": ^"../GroundPlane", "label": "  \u21b3 ground plane"},
	{"node": ^"../GrassField", "label": "Grass"},
	{"node": ^"../FloraField", "label": "Flora"},
	{"node": ^"../ShrubField", "label": "Shrubs"},
	{"node": ^"../TreeField", "label": "Trees"},
	{"node": ^"../StoneField", "label": "Stones"},
	{"node": ^"../FishField", "label": "Fish"},
	{"node": ^"../PostFX", "label": "PostFX"},
]

const FLAGS: Array[Dictionary] = [
	{"node": ^"../Terrain", "prop": "wake_enabled", "label": "Water wake"},
	{"node": ^"../Sun", "prop": "shadow_enabled", "label": "Sun shadows"},
]

const MAT_FLAGS: Array[Dictionary] = [
	{"node": ^"../GroundPlane", "param": "pom_strength", "label": "ground POM"},
	{"node": ^"../Terrain/Riverbed", "param": "pom_strength", "label": "riverbed POM"},
]

const MAT_SLIDERS: Array[Dictionary] = [
	{
		"node": ^"../GroundPlane",
		"param": "detail_amount",
		"label": "gnd detail",
		"min": 0.0,
		"max": 1.0,
		"step": 0.05,
	},
	{
		"node": ^"../GroundPlane",
		"param": "detail_turf_scale",
		"label": "gnd turf wt",
		"min": 0.0,
		"max": 1.0,
		"step": 0.05,
	},
	{
		"node": ^"../Terrain/Riverbed",
		"param": "shore_fade_start",
		"label": "bank top",
		"min": 0.5,
		"max": 10.0,
		"step": 0.1,
	},
	{
		"node": ^"../Terrain/Riverbed",
		"param": "shore_fade_end",
		"label": "bank fade",
		"min": 0.0,
		"max": 6.0,
		"step": 0.1,
	},
	{
		"node": ^"../GroundPlane",
		"param": "pom_layers_max",
		"label": "gnd layers",
		"min": 2.0,
		"max": 48.0,
		"step": 1.0,
	},
	{
		"node": ^"../GroundPlane",
		"param": "pom_shadow_samples",
		"label": "gnd shadow",
		"min": 0.0,
		"max": 32.0,
		"step": 1.0,
	},
	{
		"node": ^"../GroundPlane",
		"param": "pom_fade_end",
		"label": "gnd fade end",
		"min": 2.0,
		"max": 30.0,
		"step": 1.0,
	},
	{
		"node": ^"../Terrain/Riverbed",
		"param": "pom_layers_max",
		"label": "bed layers",
		"min": 2.0,
		"max": 48.0,
		"step": 1.0,
	},
	{
		"node": ^"../Terrain/Riverbed",
		"param": "pom_shadow_samples",
		"label": "bed shadow",
		"min": 0.0,
		"max": 32.0,
		"step": 1.0,
	},
	{
		"node": ^"../Terrain/Riverbed",
		"param": "pom_fade_end",
		"label": "bed fade end",
		"min": 2.0,
		"max": 30.0,
		"step": 1.0,
	},
	{
		"node": ^"../GroundPlane",
		"param": "macro_start",
		"label": "stroke start",
		"min": 0.0,
		"max": 60.0,
		"step": 1.0,
	},
	{
		"node": ^"../GroundPlane",
		"param": "macro_end",
		"label": "stroke end",
		"min": 1.0,
		"max": 80.0,
		"step": 1.0,
	},
]

const SLIDERS: Array[Dictionary] = [
	{
		"node": ^"../GrassField",
		"prop": "lod_near_enter",
		"label": "near band",
		"min": 1.0,
		"max": 20.0,
		"step": 0.5,
	},
	{
		"node": ^"../GrassField",
		"prop": "lod_mid_enter",
		"label": "mid band",
		"min": 2.0,
		"max": 40.0,
		"step": 0.5,
	},
	{
		"node": ^"../GrassField",
		"prop": "blade_range",
		"label": "blade_range",
		"min": 5.0,
		"max": 120.0,
		"step": 1.0,
	},
	{
		"node": ^"../GrassField",
		"prop": "thin_start",
		"label": "thin_start",
		"min": 2.5,
		"max": 80.0,
		"step": 0.5,
	},
	{
		"node": ^"../GrassField",
		"prop": "lod_near_exit",
		"label": "lod_near_exit",
		"min": 2.0,
		"max": 40.0,
		"step": 0.5,
	},
	{
		"node": ^"../GrassField",
		"prop": "grass_fade_out_end",
		"label": "fade_out_end",
		"min": 20.0,
		"max": 400.0,
		"step": 5.0,
	},
	{
		"node": ^"../GrassField",
		"prop": "transition_out_end",
		"label": "transition_end",
		"min": 20.0,
		"max": 300.0,
		"step": 5.0,
	},
]

var _root: PanelContainer
var _open := true


func _ready() -> void:
	layer = 90
	await get_tree().create_timer(1.5).timeout
	_build()
	_set_open(true)


func _build() -> void:
	_root = PanelContainer.new()
	_root.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_root.position = Vector2(-360.0, 12.0)
	_root.custom_minimum_size = Vector2(348.0, 0.0)
	add_child(_root)

	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 10)
	_root.add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var avail := get_viewport().get_visible_rect().size.y - 80.0
	scroll.custom_minimum_size = Vector2(330.0, maxf(240.0, minf(avail, 760.0)))
	margin.add_child(scroll)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 2)
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(box)

	_heading(box, "Layers")
	for layer_spec in LAYERS:
		_add_layer(box, layer_spec)

	_heading(box, "Flags")
	for flag in FLAGS:
		_add_flag(box, flag)

	_heading(box, "Materials")
	for mat_flag in MAT_FLAGS:
		_add_mat_flag(box, mat_flag)

	for mat_slider in MAT_SLIDERS:
		_add_mat_slider(box, mat_slider)

	_heading(box, "Grass")
	for slider in SLIDERS:
		_add_slider(box, slider)

	var hint := Label.new()
	hint.text = "Tab hides this panel"
	hint.modulate = Color(1.0, 1.0, 1.0, 0.5)
	box.add_child(hint)


func _heading(box: VBoxContainer, text: String) -> void:
	if box.get_child_count() > 0:
		var spacer := Control.new()
		spacer.custom_minimum_size = Vector2(0.0, 6.0)
		box.add_child(spacer)
	var label := Label.new()
	label.text = text
	label.modulate = Color(0.65, 0.85, 1.0)
	box.add_child(label)


func _add_layer(box: VBoxContainer, spec: Dictionary) -> void:
	var node := get_node_or_null(spec["node"])
	if node == null:
		return
	var check := CheckBox.new()
	check.text = spec["label"]
	check.button_pressed = bool(node.get("visible"))
	check.toggled.connect(func(on: bool) -> void:
		_set_visible(node, on)
		if spec.has("also"):
			var extra := get_node_or_null(spec["also"])
			if extra:
				_set_visible(extra, on)
	)
	box.add_child(check)


func _add_flag(box: VBoxContainer, spec: Dictionary) -> void:
	var node := get_node_or_null(spec["node"])
	if node == null:
		return
	var check := CheckBox.new()
	check.text = spec["label"]
	check.button_pressed = bool(node.get(spec["prop"]))
	check.toggled.connect(func(on: bool) -> void: node.set(spec["prop"], on))
	box.add_child(check)


func _add_mat_flag(box: VBoxContainer, spec: Dictionary) -> void:
	var node := get_node_or_null(spec["node"]) as GeometryInstance3D
	if node == null:
		return
	var mat := node.material_override as ShaderMaterial
	if mat == null:
		return
	var was := float(mat.get_shader_parameter(spec["param"]))
	var check := CheckBox.new()
	check.text = spec["label"]
	check.button_pressed = was > 0.001
	check.toggled.connect(func(on: bool) -> void:
		mat.set_shader_parameter(spec["param"], was if on else 0.0)
	)
	box.add_child(check)


func _add_mat_slider(box: VBoxContainer, spec: Dictionary) -> void:
	var node := get_node_or_null(spec["node"]) as GeometryInstance3D
	if node == null:
		return
	var mat := node.material_override as ShaderMaterial
	if mat == null:
		return
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	box.add_child(row)

	var name_label := Label.new()
	name_label.text = spec["label"]
	name_label.custom_minimum_size = Vector2(96.0, 0.0)
	row.add_child(name_label)

	var slider := HSlider.new()
	slider.min_value = spec["min"]
	slider.max_value = spec["max"]
	slider.step = spec["step"]
	slider.value = float(mat.get_shader_parameter(spec["param"]))
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.custom_minimum_size = Vector2(110.0, 0.0)
	row.add_child(slider)

	var value_label := Label.new()
	value_label.text = "%.1f" % slider.value
	value_label.custom_minimum_size = Vector2(44.0, 0.0)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(value_label)

	slider.value_changed.connect(func(v: float) -> void:
		mat.set_shader_parameter(spec["param"], v)
		value_label.text = "%.1f" % v
	)


func _add_slider(box: VBoxContainer, spec: Dictionary) -> void:
	var node := get_node_or_null(spec["node"])
	if node == null:
		return
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	box.add_child(row)

	var name_label := Label.new()
	name_label.text = spec["label"]
	name_label.custom_minimum_size = Vector2(96.0, 0.0)
	row.add_child(name_label)

	var slider := HSlider.new()
	slider.min_value = spec["min"]
	slider.max_value = spec["max"]
	slider.step = spec["step"]
	slider.value = float(node.get(spec["prop"]))
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.custom_minimum_size = Vector2(110.0, 0.0)
	row.add_child(slider)

	var value_label := Label.new()
	value_label.text = "%.1f" % slider.value
	value_label.custom_minimum_size = Vector2(44.0, 0.0)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(value_label)

	slider.value_changed.connect(func(v: float) -> void:
		node.set(spec["prop"], v)
		value_label.text = "%.1f" % v
	)


func _set_visible(node: Node, on: bool) -> void:
	node.set("visible", on)
	node.process_mode = Node.PROCESS_MODE_INHERIT if on else Node.PROCESS_MODE_DISABLED
	var world := get_parent()
	if world and world.has_method("sync_flat_ground"):
		world.sync_flat_ground()


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	if _root == null:
		return
	if key.keycode == TOGGLE_KEY:
		_set_open(not _open)
		get_viewport().set_input_as_handled()


func _set_open(open: bool) -> void:
	_open = open
	_root.visible = open
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if open else Input.MOUSE_MODE_CAPTURED
