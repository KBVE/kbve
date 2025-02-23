extends Area2D

# const CEO_TEXTURE = preload("res://assets/kbve/png/npc/earth/ceo.png")

@onready var anime = $PlanetAnimation
@onready var button := $Button

func _ready() -> void:
	anime.play()
	#connect("body_entered", _on_body_entered)
	#connect("body_exited", _on_body_exited)

func _on_body_entered(body):
	if body is Spaceship:
		# UI.show_npc(CEO_TEXTURE, "Earth CEO", "Welcome to Earth, press X to open up the shop!")
		print('Spaceship has entered')
		button.show()

func _on_body_exited(body):
	if body is Spaceship:
		button.hide()
	
func _on_button_pressed():
	get_tree().call_group("shop", "open_shop")
