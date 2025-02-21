extends Control

signal toast_fade_out

@onready var label = $CanvasGroup/Panel/Label

var toast_lifetime := 3.0
var fade_duration := 0.5
var display_timer: Timer
var fade_timer: Timer

func _ready():
	display_timer = Timer.new()
	fade_timer = Timer.new()

	display_timer.wait_time = toast_lifetime
	fade_timer.wait_time = fade_duration

	display_timer.one_shot = true
	fade_timer.one_shot = true

	add_child(display_timer)
	add_child(fade_timer)

	display_timer.connect("timeout", Callable(self, "_on_display_timer_timeout"))
	fade_timer.connect("timeout", Callable(self, "_on_fade_timer_timeout"))

func show_notification(text: String, type: String = "info"):
	label.text = text
	match type:
		"success": $CanvasGroup/Panel.modulate = Color(0.2, 1.0, 0.2, 1)  # Green
		"error": $CanvasGroup/Panel.modulate = Color(1.0, 0.2, 0.2, 1)  # Red
		"warning": $CanvasGroup/Panel.modulate = Color(1.0, 0.5, 0.2, 1)  # Orange
		_ : $CanvasGroup/Panel.modulate = Color(0.2, 0.2, 1.0, 1)  # Default: Blue (info)

	self.modulate.a = 0
	var tween = get_tree().create_tween()
	tween.tween_property(self, "modulate:a", 1.0, fade_duration).set_trans(Tween.TRANS_CUBIC)

	display_timer.start()

func _on_display_timer_timeout():
	var tween = get_tree().create_tween()
	tween.tween_property(self, "modulate:a", 0.0, fade_duration).set_trans(Tween.TRANS_CUBIC)
	fade_timer.start()

func _on_fade_timer_timeout():
	emit_signal("toast_fade_out")
