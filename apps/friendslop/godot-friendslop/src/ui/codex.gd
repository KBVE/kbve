extends HBoxContainer

## Somewhere to look at a character, a creature or a weapon on its own.
##
## Everything here exists because the alternative was launching the game and
## walking somewhere. A gait was settled by relaunching eight times to read one
## number off a log; a grip was checked by starting the world, spawning in and
## squinting at a hand. Neither needed the world, and both needed the same four
## things: pick a subject, drive it, see the rig, change one value.
##
## It drives the real character_rig rather than a preview of one, so what is on
## screen is the same animation tree, the same foot IK and the same weapon mount
## the game runs. A viewer with its own simplified path would show a rig that
## works here and nowhere else.

const Entries := preload("res://src/ui/codex_entries.gd")
const Ground := preload("res://src/ui/codex_ground.gd")
const WeaponProxy := preload("res://src/items/weapon_proxy.gd")
const CharacterRig := preload("res://src/characters/character_rig.gd")

## Set by whoever opens the Codex, so it does not have to know what it sits in.
var on_back := Callable()

var _world: Node3D
var _camera: Camera3D
var _pivot: Node3D
var _ground: Node3D
var _subject: Node3D
var _rig: Node
var _entries: Array = []
var _entry: Dictionary = {}
var _weapons: Array = []

var _info: RichTextLabel
var _subject_pick: OptionButton
var _clip_pick: OptionButton
var _weapon_pick: OptionButton
var _scrub: HSlider
var _speed: HSlider
var _heading: HSlider
var _slope: HSlider
var _slope_face: HSlider
var _walking: CheckButton
var _yaw_fix: HSlider
var _pitch_fix: HSlider
var _spinning: CheckButton
var _footik: CheckButton
var _controls: Array[Control] = []
var _fixes: Array[Control] = []
## Slider to the box holding it and its caption.
var _rows: Dictionary = {}

var _playing := true
## Guards the scrub slider against the playhead it is displaying: without it,
## following the animation moves the slider, which reads as a seek, which stops
## the playback the slider was following.
var _syncing := false


func _ready() -> void:
	_entries = Entries.all()
	_weapons = Entries.weapons()
	_build_view()
	_build_side()
	if not _entries.is_empty():
		_load(0)


func _build_view() -> void:
	var box := SubViewportContainer.new()
	box.stretch = true
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.size_flags_stretch_ratio = 1.6
	add_child(box)

	var vp := SubViewport.new()
	vp.own_world_3d = true
	vp.msaa_3d = Viewport.MSAA_4X
	box.add_child(vp)

	_world = Node3D.new()
	vp.add_child(_world)

	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.55, 0.58, 0.66)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.85, 0.85, 0.9)
	e.ambient_light_energy = 1.4
	env.environment = e
	_world.add_child(env)
	for light in [
		{"rot": Vector3(-40, 35, 0), "energy": 1.6, "tint": Color.WHITE},
		{"rot": Vector3(-15, -120, 0), "energy": 0.8, "tint": Color(0.9, 0.92, 1.0)},
		{"rot": Vector3(30, 180, 0), "energy": 1.0, "tint": Color.WHITE},
	]:
		var key := DirectionalLight3D.new()
		key.rotation_degrees = light.rot
		key.light_energy = light.energy
		key.light_color = light.tint
		_world.add_child(key)

	_ground = Ground.new()
	_world.add_child(_ground)
	_pivot = Node3D.new()
	_world.add_child(_pivot)
	_camera = Camera3D.new()
	_world.add_child(_camera)


func _build_side() -> void:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.08, 0.12, 0.95)
	style.content_margin_left = 14.0
	style.content_margin_right = 14.0
	style.content_margin_top = 10.0
	style.content_margin_bottom = 10.0
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)

	var scroll := ScrollContainer.new()
	panel.add_child(scroll)
	var side := VBoxContainer.new()
	side.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	side.add_theme_constant_override("separation", 8)
	scroll.add_child(side)

	_subject_pick = OptionButton.new()
	for entry in _entries:
		_subject_pick.add_item(entry.name)
	_subject_pick.item_selected.connect(_load)
	side.add_child(_subject_pick)

	_spinning = _add_toggle(side, "turntable", true, func(_on: bool) -> void: pass)

	# Locomotion is driven by hand rather than by a body moving through a world,
	# which is the only way to hold a speed steady long enough to judge it. The
	# blend space is fed the same call the player controller makes.
	_walking = _add_toggle(side, "locomotion", true, _set_walking)
	_speed = _add_slider(side, "speed m/s", 0.0, 6.0, 0.0)
	_heading = _add_slider(side, "heading", -PI, PI, 0.0)

	_clip_pick = OptionButton.new()
	_clip_pick.item_selected.connect(_play_clip)
	side.add_child(_clip_pick)
	var row := HBoxContainer.new()
	side.add_child(row)
	var toggle := Button.new()
	toggle.text = "play / pause"
	toggle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	toggle.pressed.connect(_toggle_play)
	row.add_child(toggle)
	_scrub = _add_slider(side, "frame", 0.0, 1.0, 0.0)
	_scrub.value_changed.connect(_seek)

	# The same weapons the Codex lists on their own are the ones the hand is
	# offered, so a mesh that has just been exported can be put in a fist without
	# it being registered twice.
	_weapon_pick = OptionButton.new()
	_weapon_pick.add_item("no weapon")
	for entry in _weapons:
		_weapon_pick.add_item(entry.name.trim_prefix("Weapon: "))
	_weapon_pick.item_selected.connect(_equip)
	side.add_child(_weapon_pick)

	# Orientation fixes for creature models, which is authoring rather than
	# viewing: the number the slider lands on is copied into the species.
	_yaw_fix = _add_slider(side, "yaw fix", -PI, PI, 0.0)
	_yaw_fix.value_changed.connect(func(_v: float) -> void: _apply_fix())
	_pitch_fix = _add_slider(side, "pitch fix", -PI * 0.5, PI * 0.5, 0.0)
	_pitch_fix.value_changed.connect(func(_v: float) -> void: _apply_fix())

	_footik = _add_toggle(side, "foot IK", true, _set_footik)
	_slope = _add_slider(side, "ground slope deg", 0.0, 40.0, 0.0)
	_slope.value_changed.connect(func(_v: float) -> void: _set_slope())
	_slope_face = _add_slider(side, "slope facing", -PI, PI, 0.0)
	_slope_face.value_changed.connect(func(_v: float) -> void: _set_slope())

	_info = RichTextLabel.new()
	_info.bbcode_enabled = true
	_info.fit_content = true
	_info.custom_minimum_size = Vector2(260, 220)
	side.add_child(_info)

	var back := Button.new()
	back.text = I18n.t("action.back")
	back.pressed.connect(func() -> void:
		if on_back.is_valid():
			on_back.call())
	side.add_child(back)

	_controls = [_walking, _speed, _heading, _clip_pick, _scrub, _weapon_pick, _footik,
			_slope, _slope_face]
	_fixes = [_yaw_fix, _pitch_fix]


## Label and slider go in together, so hiding a control that does not apply to
## the subject takes its caption with it rather than leaving a heading over the
## control below.
func _add_slider(parent: Container, label: String, from: float, to: float,
		value: float) -> HSlider:
	var row := VBoxContainer.new()
	row.add_theme_constant_override("separation", 2)
	parent.add_child(row)
	var text := Label.new()
	text.text = label
	text.add_theme_font_size_override("font_size", 14)
	row.add_child(text)
	var slider := HSlider.new()
	slider.custom_minimum_size = Vector2(0, 24)
	slider.min_value = from
	slider.max_value = to
	slider.step = 0.01
	slider.value = value
	row.add_child(slider)
	_rows[slider] = row
	return slider


func _add_toggle(parent: Container, label: String, on: bool,
		changed: Callable) -> CheckButton:
	var check := CheckButton.new()
	check.text = label
	check.button_pressed = on
	check.toggled.connect(changed)
	parent.add_child(check)
	return check


## Swaps what is on the turntable. Everything below rebuilds rather than being
## reconfigured, since a rig sets itself up in _ready and half of what the Codex
## changes is decided there.
func _load(index: int) -> void:
	if index < 0 or index >= _entries.size():
		return
	_entry = _entries[index]
	_rig = null
	if _subject:
		_subject.queue_free()
		_subject = null

	match _entry.kind:
		"character":
			_subject = _build_character()
		"weapon":
			_subject = _build_weapon(_entry)
		_:
			_subject = _build_model()
	if _subject == null:
		return
	_pivot.add_child(_subject)
	_fill_clips()
	_frame()
	_set_slope()
	_report()
	var is_character := _rig != null
	for control in _controls:
		_show_control(control, is_character)
	for control in _fixes:
		_show_control(control, _entry.kind == "model")
	if _entry.kind == "model":
		_syncing = true
		_yaw_fix.value = _entry.species.model_yaw_fix
		_pitch_fix.value = _entry.species.model_pitch_fix
		_syncing = false


func _build_character() -> Node3D:
	var rig := Node3D.new()
	rig.set_script(CharacterRig)
	rig.body = load(_entry.scene)
	var attachments: Array[PackedScene] = []
	for path in _entry.get("attachments", []):
		if ResourceLoader.exists(path):
			attachments.append(load(path))
	rig.attachments = attachments
	var sources: Array[PackedScene] = []
	for path in _entry.get("animations", []):
		if ResourceLoader.exists(path):
			sources.append(load(path))
	rig.animation_sources = sources
	rig.locomotion = true
	rig.foot_ik = true
	rig.snap_to_terrain = false
	# Absolute, because the rig resolves this in its own _ready and is not in the
	# tree yet to be counted from.
	rig.terrain_path = _ground.get_path()
	_rig = rig
	return rig


## A weapon from wherever it came from. A stand-in and an exported mesh differ
## only in which key the entry carries.
func _build_weapon(entry: Dictionary) -> Node3D:
	if entry.has("proxy"):
		return WeaponProxy.make(entry.proxy)
	var scene := load(entry.scene) as PackedScene
	if scene == null:
		return null
	return scene.instantiate() as Node3D


func _build_model() -> Node3D:
	var subject: Node3D = _entry.species.model.instantiate()
	subject.scale = Vector3.ONE * _entry.species.scale
	subject.rotation.y = _entry.species.model_yaw_fix
	subject.rotation.x = _entry.species.model_pitch_fix
	return subject


func _fill_clips() -> void:
	_clip_pick.clear()
	if _rig == null or _rig.animation == null:
		return
	for name in _rig.animation.get_animation_list():
		_clip_pick.add_item(name)


func _set_walking(on: bool) -> void:
	if _rig and _rig.tree:
		_rig.tree.active = on
	if not on:
		_play_clip(_clip_pick.selected)


func _play_clip(index: int) -> void:
	if _rig == null or _rig.animation == null or index < 0:
		return
	if _walking.button_pressed:
		return
	var name := _clip_pick.get_item_text(index)
	if not _rig.animation.has_animation(name):
		return
	_rig.animation.play(name)
	_playing = true
	_scrub.max_value = maxf(_rig.animation.get_animation(name).length, 0.01)


func _toggle_play() -> void:
	if _rig == null or _rig.animation == null:
		return
	_playing = not _playing
	_rig.animation.speed_scale = 1.0 if _playing else 0.0


func _seek(value: float) -> void:
	if _syncing or _rig == null or _rig.animation == null:
		return
	_playing = false
	_rig.animation.speed_scale = 0.0
	_rig.animation.seek(value, true)


func _equip(index: int) -> void:
	if _rig == null or _rig.mount == null:
		return
	if index <= 0 or index > _weapons.size():
		_rig.mount.equip(null)
		return
	var entry: Dictionary = _weapons[index - 1]
	if entry.has("proxy"):
		_rig.mount.equip_proxy(entry.proxy)
	else:
		_rig.mount.equip(load(entry.scene))


func _show_control(control: Control, shown: bool) -> void:
	var row: Control = _rows.get(control, control)
	row.visible = shown


## Applied to the model on screen and reported, so the value can be read off
## and written into the species where it belongs.
func _apply_fix() -> void:
	if _syncing or _subject == null or _entry.get("kind") != "model":
		return
	_subject.rotation.y = _yaw_fix.value
	_subject.rotation.x = _pitch_fix.value
	_report()


func _set_footik(on: bool) -> void:
	if _rig and _rig.ik:
		_rig.ik.active = on


func _set_slope() -> void:
	if _ground:
		_ground.set_slope(_slope.value, _slope_face.value)


func _frame() -> void:
	var box := _aabb(_subject)
	var reach: float = maxf(box.size.length(), 0.5) * 1.1
	_camera.look_at_from_position(
			Vector3(reach, box.size.y * 0.45 + box.position.y, reach), box.get_center())


func _report() -> void:
	var lines: Array = ["[b]%s[/b]" % _entry.name]
	var box := _aabb(_subject)
	lines.append("size %.2f x %.2f x %.2f m" % [box.size.x, box.size.y, box.size.z])
	if _rig and _rig.skeleton:
		lines.append("skeleton: %d bones" % _rig.skeleton.get_bone_count())
	if _entry.kind == "weapon":
		var two := WeaponProxy.two_handed(_entry.proxy) if _entry.has("proxy") \
				else _subject.get_node_or_null("Grip_Off") != null
		lines.append("two-handed: %s" % str(two))
		if _subject.get_node_or_null("Grip_Main") == null:
			lines.append("[color=#ff9a5a]no Grip_Main marker[/color]")
	if _entry.kind == "model":
		lines.append("model_yaw_fix = %.2f\nmodel_pitch_fix = %.2f" % [
				_yaw_fix.value, _pitch_fix.value])
	_info.text = "\n".join(lines)


func _aabb(root: Node) -> AABB:
	var out := AABB()
	var first := true
	var stack: Array = [root]
	while not stack.is_empty():
		var node: Node = stack.pop_back()
		if node is MeshInstance3D:
			var mesh := node as MeshInstance3D
			var box := mesh.global_transform * mesh.get_aabb()
			out = box if first else out.merge(box)
			first = false
		stack.append_array(node.get_children())
	return out


func _process(delta: float) -> void:
	if not visible:
		return
	if _spinning and _spinning.button_pressed and _pivot:
		_pivot.rotation.y += 0.008
	if _rig == null:
		return
	if _walking.button_pressed and _rig.has_method("set_locomotion"):
		# x is right and z is backward in the rig's own frame, so forward is -z.
		var speed: float = _speed.value
		var local := Vector3(sin(_heading.value) * speed, 0.0, -cos(_heading.value) * speed)
		_rig.set_locomotion(local, false, delta)
	elif _playing and _rig.animation and _rig.animation.is_playing():
		_syncing = true
		_scrub.value = _rig.animation.current_animation_position
		_syncing = false
