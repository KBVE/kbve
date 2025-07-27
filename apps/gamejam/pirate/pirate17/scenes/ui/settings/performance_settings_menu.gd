class_name PerformanceSettingsMenu
extends Control

signal settings_changed(setting_name: String, value: Variant)

@onready var auto_quality_toggle: CheckBox
@onready var quality_slider: HSlider
@onready var fps_display: Label
@onready var performance_info: RichTextLabel

var web_performance_manager: WebPerformanceManager
var is_auto_quality: bool = true

func _ready():
	setup_ui()
	connect_to_performance_manager()
	
	# Start FPS monitoring
	var fps_timer = Timer.new()
	fps_timer.wait_time = 1.0
	fps_timer.timeout.connect(update_fps_display)
	fps_timer.autostart = true
	add_child(fps_timer)

func setup_ui():
	name = "PerformanceSettings"
	set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	size = Vector2(400, 300)
	
	var bg = ColorRect.new()
	bg.color = Color(0.1, 0.1, 0.1, 0.9)
	bg.size = size
	add_child(bg)
	
	var vbox = VBoxContainer.new()
	vbox.position = Vector2(20, 20)
	vbox.size = Vector2(360, 260)
	vbox.add_theme_constant_override("separation", 15)
	add_child(vbox)
	
	# Title
	var title = Label.new()
	title.text = "Performance Settings"
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", Color.WHITE)
	vbox.add_child(title)
	
	# Auto Quality Toggle
	var auto_container = HBoxContainer.new()
	vbox.add_child(auto_container)
	
	var auto_label = Label.new()
	auto_label.text = "Auto Quality Adjustment:"
	auto_label.add_theme_color_override("font_color", Color.WHITE)
	auto_container.add_child(auto_label)
	
	auto_quality_toggle = CheckBox.new()
	auto_quality_toggle.button_pressed = is_auto_quality
	auto_quality_toggle.toggled.connect(_on_auto_quality_toggled)
	auto_container.add_child(auto_quality_toggle)
	
	# Quality Slider
	var quality_container = VBoxContainer.new()
	vbox.add_child(quality_container)
	
	var quality_label = Label.new()
	quality_label.text = "Manual Quality Level:"
	quality_label.add_theme_color_override("font_color", Color.WHITE)
	quality_container.add_child(quality_label)
	
	quality_slider = HSlider.new()
	quality_slider.min_value = 0
	quality_slider.max_value = 2
	quality_slider.step = 1
	quality_slider.value = 1
	quality_slider.disabled = is_auto_quality
	quality_slider.value_changed.connect(_on_quality_changed)
	quality_container.add_child(quality_slider)
	
	var quality_labels = HBoxContainer.new()
	quality_container.add_child(quality_labels)
	
	for label_text in ["Low", "Medium", "High"]:
		var ql = Label.new()
		ql.text = label_text
		ql.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		ql.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		ql.add_theme_font_size_override("font_size", 10)
		ql.add_theme_color_override("font_color", Color.LIGHT_GRAY)
		quality_labels.add_child(ql)
	
	# FPS Display
	fps_display = Label.new()
	fps_display.text = "FPS: --"
	fps_display.add_theme_font_size_override("font_size", 14)
	fps_display.add_theme_color_override("font_color", Color.YELLOW)
	vbox.add_child(fps_display)
	
	# Performance Info
	var info_label = Label.new()
	info_label.text = "Performance Information:"
	info_label.add_theme_color_override("font_color", Color.WHITE)
	vbox.add_child(info_label)
	
	performance_info = RichTextLabel.new()
	performance_info.size = Vector2(360, 80)
	performance_info.add_theme_font_size_override("normal_font_size", 10)
	performance_info.bbcode_enabled = true
	vbox.add_child(performance_info)
	
	# Close Button
	var close_button = Button.new()
	close_button.text = "Close"
	close_button.pressed.connect(hide)
	vbox.add_child(close_button)

func connect_to_performance_manager():
	var main_scene = get_tree().current_scene
	if main_scene and main_scene.has_method("get_web_performance_manager"):
		web_performance_manager = main_scene.get_web_performance_manager()
		if web_performance_manager:
			web_performance_manager.performance_changed.connect(_on_performance_level_changed)

func _on_auto_quality_toggled(enabled: bool):
	is_auto_quality = enabled
	quality_slider.disabled = enabled
	
	if web_performance_manager:
		if enabled:
			web_performance_manager.resume_automatic_adjustment()
		else:
			var quality_level = int(quality_slider.value)
			web_performance_manager.force_performance_level(quality_level)
	
	settings_changed.emit("auto_quality", enabled)

func _on_quality_changed(value: float):
	if not is_auto_quality and web_performance_manager:
		var quality_level = int(value)
		web_performance_manager.force_performance_level(quality_level)
		settings_changed.emit("manual_quality", quality_level)

func _on_performance_level_changed(level: String):
	update_performance_info()

func update_fps_display():
	var fps = Engine.get_frames_per_second()
	var color = "green"
	if fps < 30:
		color = "red"
	elif fps < 45:
		color = "yellow"
	
	fps_display.text = "FPS: [color=%s]%d[/color]" % [color, fps]
	fps_display.bbcode_enabled = true
	
	update_performance_info()

func update_performance_info():
	if not web_performance_manager:
		return
	
	var stats = web_performance_manager.get_performance_stats()
	var current_settings = web_performance_manager.get_current_performance_settings()
	
	var info_text = "[color=cyan]Current Settings:[/color]\n"
	info_text += "• Performance Level: [color=yellow]%s[/color]\n" % stats.performance_level
	info_text += "• View Distance: %d chunks\n" % current_settings.chunk_view_distance
	info_text += "• Max NPCs: %d ships\n" % current_settings.max_npcs
	info_text += "• Animation Quality: %d%%\n" % (current_settings.animation_quality * 100)
	
	info_text += "\n[color=orange]Browser Optimizations Active[/color]"
	
	performance_info.text = info_text

func show_performance_menu():
	"""Show the performance settings menu"""
	visible = true
	update_performance_info()

func get_performance_advice() -> String:
	"""Get performance advice based on current FPS"""
	var fps = Engine.get_frames_per_second()
	
	if fps >= 50:
		return "Performance is excellent! All features enabled."
	elif fps >= 35:
		return "Good performance. Consider enabling more visual effects."
	elif fps >= 25:
		return "Moderate performance. Some features may be reduced."
	else:
		return "Low performance detected. Optimizations applied automatically."