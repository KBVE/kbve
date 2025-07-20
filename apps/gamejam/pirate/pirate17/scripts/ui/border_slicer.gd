class_name BorderSlicer
extends RefCounted

static var border_textures: Array[ImageTexture] = []
static var border_image: Image
static var is_loaded: bool = false

const BORDER_ASSET_PATH = "res://assets/ui/border.png"
const GRID_WIDTH = 10
const GRID_HEIGHT = 8
const TILE_SIZE = 64  # Assuming 64x64 per border tile

static func load_and_slice_borders():
	if is_loaded:
		return
	
	# Load the main border texture first, then get the image
	var border_texture = load(BORDER_ASSET_PATH) as Texture2D
	if border_texture == null:
		push_error("Failed to load border texture from: " + BORDER_ASSET_PATH)
		return
	
	border_image = border_texture.get_image()
	if border_image == null:
		push_error("Failed to get image from border texture")
		return
	
	print("Border image loaded: ", border_image.get_width(), "x", border_image.get_height())
	
	# Calculate actual tile size based on image dimensions
	var actual_tile_width = border_image.get_width() / GRID_WIDTH
	var actual_tile_height = border_image.get_height() / GRID_HEIGHT
	
	print("Calculated tile size: ", actual_tile_width, "x", actual_tile_height)
	
	# Slice the image into individual border textures
	border_textures.clear()
	border_textures.resize(GRID_WIDTH * GRID_HEIGHT)
	
	for y in range(GRID_HEIGHT):
		for x in range(GRID_WIDTH):
			var index = y * GRID_WIDTH + x
			var slice_rect = Rect2i(
				x * actual_tile_width,
				y * actual_tile_height,
				actual_tile_width,
				actual_tile_height
			)
			
			# Create a new image for this slice with transparency
			var slice_image = Image.create(actual_tile_width, actual_tile_height, true, Image.FORMAT_RGBA8)
			slice_image.blit_rect(border_image, slice_rect, Vector2i.ZERO)
			
			# Make black/dark pixels transparent (assuming black centers should be transparent)
			for px in range(actual_tile_width):
				for py in range(actual_tile_height):
					var pixel_color = slice_image.get_pixel(px, py)
					# If pixel is dark (more aggressive threshold), make it transparent
					if pixel_color.r < 0.3 and pixel_color.g < 0.3 and pixel_color.b < 0.3:
						slice_image.set_pixel(px, py, Color(0, 0, 0, 0))  # Fully transparent
			
			# Convert to texture
			var texture = ImageTexture.new()
			texture.set_image(slice_image)
			border_textures[index] = texture
	
	is_loaded = true
	print("Border slicing complete. Created ", border_textures.size(), " border textures.")

static func get_border_texture(index: int) -> ImageTexture:
	if not is_loaded:
		load_and_slice_borders()
	
	if index >= 0 and index < border_textures.size():
		return border_textures[index]
	else:
		push_error("Invalid border index: " + str(index))
		return null

static func get_border_texture_by_position(x: int, y: int) -> ImageTexture:
	var index = y * GRID_WIDTH + x
	return get_border_texture(index)

# Predefined border styles for easy access
static func get_simple_border() -> ImageTexture:
	return get_border_texture_by_position(0, 0)  # Top-left border

static func get_thick_border() -> ImageTexture:
	return get_border_texture_by_position(1, 0)  # Second border in top row

static func get_dotted_border() -> ImageTexture:
	return get_border_texture_by_position(2, 0)  # Third border in top row

static func get_fancy_border() -> ImageTexture:
	return get_border_texture_by_position(7, 6)  # Bottom-right decorative border