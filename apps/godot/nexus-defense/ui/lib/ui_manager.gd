extends Node

const LAYER_HUD := 10
const LAYER_PANEL := 20
const LAYER_TOAST := 30
const LAYER_MODAL := 40

const UiThemeBuilder := preload("res://ui/lib/ui_theme.gd")
const PanelBase := preload("res://ui/components/panel_base.gd")
const HudTop := preload("res://ui/components/hud_top.gd")
const BuildBar := preload("res://ui/components/build_bar.gd")
const WaveBanner := preload("res://ui/components/wave_banner.gd")
const PauseModal := preload("res://ui/components/pause_modal.gd")
const BootScreen := preload("res://ui/components/boot_screen.gd")
const Toast := preload("res://ui/components/toast.gd")
const MainMenu := preload("res://ui/components/main_menu.gd")

signal opened(panel_name: String)
signal closed(panel_name: String)

var theme_ref: Theme
var _layers: Dictionary = {}
var _registry: Dictionary = {}
var _live: Dictionary = {}
var _toast_stack: Array[Control] = []

func _ready() -> void:
	theme_ref = UiThemeBuilder.build()
	_make_layer(LAYER_HUD, "HudLayer")
	_make_layer(LAYER_PANEL, "PanelLayer")
	_make_layer(LAYER_TOAST, "ToastLayer")
	_make_layer(LAYER_MODAL, "ModalLayer")
	_register_defaults()

func _make_layer(idx: int, name: String) -> CanvasLayer:
	var l := CanvasLayer.new()
	l.name = name
	l.layer = idx
	add_child(l)
	_layers[idx] = l
	return l

func _register_defaults() -> void:
	register("hud_top", HudTop, LAYER_HUD)
	register("build_bar", BuildBar, LAYER_HUD)
	register("wave_banner", WaveBanner, LAYER_HUD)
	register("pause", PauseModal, LAYER_MODAL)
	register("boot", BootScreen, LAYER_MODAL)
	register("main_menu", MainMenu, LAYER_MODAL)

func register(panel_name: String, script: Script, layer_idx: int = LAYER_PANEL) -> void:
	_registry[panel_name] = {"script": script, "layer": layer_idx}

func open(panel_name: String, data: Variant = null) -> Control:
	if _live.has(panel_name):
		var existing: Control = _live[panel_name]
		if data != null and existing.has_method("apply"):
			existing.apply(data)
		return existing
	if not _registry.has(panel_name):
		push_warning("UiManager: unknown panel '%s'" % panel_name)
		return null
	var entry: Dictionary = _registry[panel_name]
	var inst: Control = entry["script"].new()
	inst.theme = theme_ref
	_layers[entry["layer"]].add_child(inst)
	_fit_panel_to_viewport(inst)
	get_viewport().size_changed.connect(_fit_panel_to_viewport.bind(inst))
	_live[panel_name] = inst
	inst.tree_exiting.connect(_on_panel_exit.bind(panel_name))
	if data != null and inst.has_method("apply"):
		inst.apply(data)
	if inst.has_method("open_anim"):
		inst.open_anim()
	opened.emit(panel_name)
	return inst

func close(panel_name: String) -> void:
	if not _live.has(panel_name):
		return
	var inst: Control = _live[panel_name]
	if inst.has_method("close_anim"):
		await inst.close_anim()
	if is_instance_valid(inst):
		inst.queue_free()

func toggle(panel_name: String, data: Variant = null) -> Control:
	if _live.has(panel_name):
		close(panel_name)
		return null
	return open(panel_name, data)

func get_panel(panel_name: String) -> Control:
	return _live.get(panel_name, null)

func is_open(panel_name: String) -> bool:
	return _live.has(panel_name)

func toast(message: String, duration: float = 2.0, kind: String = "info") -> void:
	var inst: Control = Toast.new()
	inst.theme = theme_ref
	_layers[LAYER_TOAST].add_child(inst)
	_toast_stack.append(inst)
	inst.tree_exiting.connect(func() -> void: _toast_stack.erase(inst))
	inst.position_in_stack(_toast_stack.size() - 1)
	inst.show_toast(message, duration, kind)
	_reflow_toasts()

func _reflow_toasts() -> void:
	for i in _toast_stack.size():
		var t: Control = _toast_stack[i]
		if is_instance_valid(t) and t.has_method("position_in_stack"):
			t.position_in_stack(i)

func _fit_panel_to_viewport(inst: Control) -> void:
	if not is_instance_valid(inst):
		return
	var vp_size: Vector2 = get_viewport().get_visible_rect().size
	inst.size = vp_size
	inst.position = Vector2.ZERO

func _on_panel_exit(panel_name: String) -> void:
	if _live.get(panel_name) and not is_instance_valid(_live[panel_name]):
		_live.erase(panel_name)
	elif _live.has(panel_name):
		_live.erase(panel_name)
	closed.emit(panel_name)
