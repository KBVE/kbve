extends Area2D

#onready var shop := shop_path in the game scene


func _on_body_entered(body) -> void:
	if body is Spaceship:
		# Show button that can open the shop
		# if clicked:
			# get_tree().paused = true - Pause game
			# shop.show() - Show shop
			# animation_shop_open.play() - Animation opening the shop
		pass
	
	# On the shop, when pressing the top right button, it exits/hide the shop/reverse the animation,
	# and then unpause the game

func _on_body_exited(body):
	if body is Spaceship:
		# hide the button
		pass # Replace with function body.
