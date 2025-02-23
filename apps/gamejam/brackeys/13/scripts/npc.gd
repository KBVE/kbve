extends CanvasLayer

@onready var dialog_box = $Control
@onready var npc_image = $Control/NPCImage
@onready var npc_name = $Control/VBoxContainer/NPCName
@onready var dialog_text = $Control/VBoxContainer/DialogText
@onready var close_button = $Control/CloseButton
var tween: Tween

func _ready():
	layer = 10
	dialog_box.z_index = 100
	visible = false
	close_button.connect("pressed", hide_npc)
	
func set_npc_data(image: Texture, name: String, text: String):
	print("Showing NPC Dialog")
	npc_image.texture = image
	npc_name.text = name
	dialog_text.text = text
	dialog_text.visible_ratio = 0.0
	visible = true

	dialog_box.modulate = Color(1, 1, 1, 0)
	tween = create_tween()
	tween.tween_property(dialog_box, "modulate", Color(1, 1, 1, 1), 0.5)

	start_typing_effect(text)

func start_typing_effect(text: String):
	if tween:
		tween.kill()

	var char_count = text.length()
	var duration = max(1.0, char_count / 50.0)
	tween = create_tween()
	tween.tween_property(dialog_text, "visible_ratio", 1.0, duration).from(0.0)

func hide_npc():
	if tween:
		tween.kill()
	tween = create_tween()
	tween.tween_property(dialog_box, "modulate", Color(1, 1, 1, 0), 0.5)
	await tween.finished
	dialog_box.visible = false
