extends TextureRect

@export var lights_on : CompressedTexture2D
@export var lights_off : CompressedTexture2D

@onready var light : Array[CompressedTexture2D] = [lights_on, lights_off]

var flicker := 0.5

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta):
	if flicker <= 0:
		flicker = randf_range(0.3,0.8)
		texture = light[randi_range(0,1)]
	flicker -= 1 * delta
