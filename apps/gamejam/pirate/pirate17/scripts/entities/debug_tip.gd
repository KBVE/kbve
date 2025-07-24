extends Node2D

func _draw():
	# Draw small red dot at spear tip for debugging collision point
	# This should align with the metal tip of the spear sprite
	draw_circle(Vector2.ZERO, 3, Color(1, 0, 0, 0.8))
	# Draw collision radius
	draw_arc(Vector2.ZERO, 8.0, 0, TAU, 16, Color(1, 0, 0, 0.3), 1.0)