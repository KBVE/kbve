extends Node2D

func _ready():
	# Redraw every frame to show current collision position
	set_process(true)

func _process(_delta):
	# Redraw to show current collision position
	queue_redraw()

func _draw():
	# Get the parent spear to access its collision calculations
	var spear = get_parent()
	if not spear or not spear.has_method("get_collision_tip_offset"):
		# Fallback to fixed position if we can't get dynamic data
		draw_circle(Vector2.ZERO, 3, Color(1, 0, 0, 0.8))
		draw_arc(Vector2.ZERO, 8.0, 0, TAU, 16, Color(1, 0, 0, 0.3), 1.0)
		return
	
	# Get the actual collision offset from the spear
	var tip_offset_vector = spear.get_collision_tip_offset()
	
	# Draw at the exact position where collision detection happens
	draw_circle(tip_offset_vector, 3, Color(1, 0, 0, 0.8))
	# Draw collision radius
	draw_arc(tip_offset_vector, spear.collision_radius, 0, TAU, 16, Color(1, 0, 0, 0.3), 1.0)