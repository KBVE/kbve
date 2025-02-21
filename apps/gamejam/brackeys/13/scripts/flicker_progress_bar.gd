extends ProgressBar

var flicker := 0.3


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta) -> void:
	if flicker <= 0:
		flicker = randf_range(0.1,0.5)
		value = randi_range(0,100)
	flicker -= 1 * delta
