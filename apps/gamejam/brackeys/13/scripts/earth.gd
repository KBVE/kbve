extends Area2D

const CEO_TEXTURE = preload("res://assets/kbve/png/npc/earth/ceo.png")
@onready var anime = $PlanetAnimation

func _ready() -> void:
	anime.play()
	connect("body_entered", _on_body_entered)
	connect("body_exited", _on_body_exited)

func _on_body_entered(body):
	if body is Spaceship:
		UI.show_npc(CEO_TEXTURE, "Earth CEO", "Welcome to Earth, press X to open up the shop!")
		print('Spaceship has entered')

func _on_body_exited(body):
	if body is Spaceship:
		print('Spaceship left the Earth bounds')
