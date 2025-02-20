extends Control


const TOAST_SCENE = preload("res://scenes/ui/toast.tscn")

var toast_queue: Array = []
var displayed_messages := {}
var is_displaying_toast = false
var toast: Control

func _ready():
	toast = TOAST_SCENE.instantiate()
	add_child(toast)
	toast.visible = false
	toast.connect("toast_fade_out", Callable(self, "_on_toast_fade_out"))
	Global.connect("notification_received", Callable(self, "show_toast"))

func show_toast(message_id: String, message: String, type: String = "info"):
	if message_id in displayed_messages:
		return
	
	displayed_messages[message_id] = true
	toast_queue.append({"message_id": message_id, "message": message, "type": type})
	if not is_displaying_toast:
		_process_queue()

func _process_queue():
	if toast_queue.size() > 0:
		is_displaying_toast = true
		var next_toast_data = toast_queue.pop_front()
		_update_toast(next_toast_data.message_id, next_toast_data.message, next_toast_data.type)
	else:
		is_displaying_toast = false
		
func _update_toast(message_id: String, text: String, type: String):
	toast.show_notification(text, type)
	toast.visible = true

func _on_toast_fade_out():
	for key in displayed_messages.keys():
		if displayed_messages[key] == true:
			displayed_messages.erase(key)
			break
	toast.visible = false
	_process_queue()
