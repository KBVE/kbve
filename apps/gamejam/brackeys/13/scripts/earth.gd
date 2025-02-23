extends Area2D

@onready var anime := $PlanetAnimation
@onready var button := $Button


func _on_button_pressed():
	get_tree().call_group("shop", "open_shop")


func _on_body_entered(body):
	if body is Spaceship:
		button.show()


func _on_body_exited(body):
	if body is Spaceship:
		button.hide()
