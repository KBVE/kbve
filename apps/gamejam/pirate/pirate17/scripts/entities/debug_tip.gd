extends Node2D

func _ready():
	set_process(true)

func _process(_delta):
	queue_redraw()

func _draw():
	var spear = get_parent()
	if not spear or not spear.has_method("get_collision_tip_offset"):
		draw_circle(Vector2.ZERO, 3, Color(1, 0, 0, 0.8))
		draw_arc(Vector2.ZERO, 8.0, 0, TAU, 16, Color(1, 0, 0, 0.3), 1.0)
		return
	var tip_offset_vector = spear.get_collision_tip_offset()
	draw_circle(tip_offset_vector, 3, Color(1, 0, 0, 0.8))
	draw_arc(tip_offset_vector, spear.collision_radius, 0, TAU, 16, Color(1, 0, 0, 0.3), 1.0)