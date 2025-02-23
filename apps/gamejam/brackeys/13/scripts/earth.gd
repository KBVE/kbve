extends Area2D

@onready var anime = $PlanetAnimation

func _ready() -> void:
	anime.play()
	connect("body_entered", _on_body_entered)
	connect("body_exited", _on_body_exited)

func _on_body_entered(body):
	if body is Spaceship:
		print('Spaceship has entered')

func _on_body_exited(body):
	if body is Spaceship:
		print('Spaceship left the Earth bounds')
