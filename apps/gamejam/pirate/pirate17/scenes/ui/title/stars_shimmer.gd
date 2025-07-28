extends Sprite2D

func _ready():
	start_shimmer_animation()

func start_shimmer_animation():
	var shimmer_tween = create_tween()
	shimmer_tween.set_loops()
	shimmer_tween.set_parallel(true)
	var opacity_tween = shimmer_tween.tween_method(
		func(alpha: float): modulate = Color(modulate.r, modulate.g, modulate.b, alpha),
		0.4,
		1.0,
		2.0
	)
	opacity_tween.set_ease(Tween.EASE_IN_OUT)
	opacity_tween.set_trans(Tween.TRANS_CUBIC)
	
	var opacity_reverse = shimmer_tween.tween_method(
		func(alpha: float): modulate = Color(modulate.r, modulate.g, modulate.b, alpha),
		1.0,
		0.4,
		2.0
	)
	opacity_reverse.set_ease(Tween.EASE_IN_OUT)
	opacity_reverse.set_trans(Tween.TRANS_CUBIC)
	opacity_reverse.set_delay(2.0)
	var color_tween = shimmer_tween.tween_method(
		func(color_val: float): 
			var current_alpha = modulate.a
			var r = lerp(1.0, 0.8, color_val)
			var g = lerp(1.0, 0.9, color_val)
			var b = lerp(0.8, 1.2, color_val)
			modulate = Color(r, g, b, current_alpha),
		0.0,
		1.0,
		3.0
	)
	color_tween.set_ease(Tween.EASE_IN_OUT)
	color_tween.set_trans(Tween.TRANS_SINE)
	
	var color_reverse = shimmer_tween.tween_method(
		func(color_val: float): 
			var current_alpha = modulate.a
			var r = lerp(0.8, 1.0, color_val)
			var g = lerp(0.9, 1.0, color_val)
			var b = lerp(1.2, 0.8, color_val)
			modulate = Color(r, g, b, current_alpha),
		0.0,
		1.0,
		3.0
	)
	color_reverse.set_ease(Tween.EASE_IN_OUT)
	color_reverse.set_trans(Tween.TRANS_SINE)
	color_reverse.set_delay(3.0)
	
