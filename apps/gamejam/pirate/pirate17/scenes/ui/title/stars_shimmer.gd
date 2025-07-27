extends Sprite2D

func _ready():
	# Start the shimmer animation
	start_shimmer_animation()

func start_shimmer_animation():
	# Create shimmer animation with enhanced effects
	var shimmer_tween = create_tween()
	shimmer_tween.set_loops()  # Loop indefinitely
	shimmer_tween.set_parallel(true)  # Allow multiple animations at once
	
	# Dramatic opacity shimmer - breathing/glowing effect
	var opacity_tween = shimmer_tween.tween_method(
		func(alpha: float): modulate = Color(modulate.r, modulate.g, modulate.b, alpha),
		0.4,  # Lower start opacity for dramatic effect
		1.0,  # Full brightness
		2.0   # Duration for noticeable pulse
	)
	opacity_tween.set_ease(Tween.EASE_IN_OUT)
	opacity_tween.set_trans(Tween.TRANS_CUBIC)
	
	# Reverse opacity animation
	var opacity_reverse = shimmer_tween.tween_method(
		func(alpha: float): modulate = Color(modulate.r, modulate.g, modulate.b, alpha),
		1.0,  # Full brightness
		0.4,  # Dimmer
		2.0   # Duration
	)
	opacity_reverse.set_ease(Tween.EASE_IN_OUT)
	opacity_reverse.set_trans(Tween.TRANS_CUBIC)
	opacity_reverse.set_delay(2.0)  # Start after first animation
	
	# Color shimmer - blue-white-yellow tint variation
	var color_tween = shimmer_tween.tween_method(
		func(color_val: float): 
			var current_alpha = modulate.a
			# Shift between warm yellow and cool blue
			var r = lerp(1.0, 0.8, color_val)
			var g = lerp(1.0, 0.9, color_val)
			var b = lerp(0.8, 1.2, color_val)
			modulate = Color(r, g, b, current_alpha),
		0.0,  # Start warm/yellow
		1.0,  # End cool/blue
		3.0   # Duration
	)
	color_tween.set_ease(Tween.EASE_IN_OUT)
	color_tween.set_trans(Tween.TRANS_SINE)
	
	# Reverse color animation
	var color_reverse = shimmer_tween.tween_method(
		func(color_val: float): 
			var current_alpha = modulate.a
			# Shift back from blue to yellow
			var r = lerp(0.8, 1.0, color_val)
			var g = lerp(0.9, 1.0, color_val)
			var b = lerp(1.2, 0.8, color_val)
			modulate = Color(r, g, b, current_alpha),
		0.0,  # Start cool/blue
		1.0,  # End warm/yellow
		3.0   # Duration
	)
	color_reverse.set_ease(Tween.EASE_IN_OUT)
	color_reverse.set_trans(Tween.TRANS_SINE)
	color_reverse.set_delay(3.0)  # Start after first color animation
	
	print("Stars shimmer animation started")