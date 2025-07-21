class_name ShipShadow
extends Node2D

## A shadow component that can be attached to ships to create a visual shadow effect
## The shadow automatically follows the parent ship and can be customized

@export var shadow_offset: Vector2 = Vector2(12, 12)  ## Offset from the ship position
@export var shadow_color: Color = Color(0, 0, 0, 0.6)  ## Shadow color (dark, semi-transparent)
@export var shadow_scale: float = 0.7  ## Shadow scale relative to ship sprite
@export var auto_setup: bool = true  ## Automatically find and copy parent sprite

var shadow_sprite: Sprite2D
var target_sprite: Sprite2D
var parent_ship: Node2D

func _ready():
	if auto_setup:
		setup_shadow()

func setup_shadow():
	# Find the parent ship node
	parent_ship = get_parent()
	if not parent_ship:
		print("ShipShadow: No parent found")
		return
	
	# Find the main sprite in the parent ship
	target_sprite = find_sprite_in_parent()
	if not target_sprite:
		print("ShipShadow: No sprite found in parent ship")
		return
	
	# Create the shadow sprite
	create_shadow_sprite()
	
	print("ShipShadow: Shadow created for ", parent_ship.name)

func find_sprite_in_parent() -> Sprite2D:
	# Look for a Sprite2D node in the parent
	# Try common names first
	var common_names = ["Sprite2D", "ShipSprite", "sprite", "body_sprite"]
	
	for name in common_names:
		var sprite = parent_ship.get_node_or_null(name)
		if sprite and sprite is Sprite2D:
			return sprite
	
	# If not found by name, search all children
	for child in parent_ship.get_children():
		if child is Sprite2D:
			return child
	
	# Search recursively in case the sprite is nested
	return find_sprite_recursive(parent_ship)

func find_sprite_recursive(node: Node) -> Sprite2D:
	for child in node.get_children():
		if child is Sprite2D:
			return child
		var result = find_sprite_recursive(child)
		if result:
			return result
	return null

func create_shadow_sprite():
	if not target_sprite:
		return
	
	# Create a new Sprite2D for the shadow
	shadow_sprite = Sprite2D.new()
	shadow_sprite.name = "Shadow"
	
	# Copy the texture from the target sprite
	shadow_sprite.texture = target_sprite.texture
	
	# Set up shadow properties
	shadow_sprite.modulate = shadow_color
	shadow_sprite.scale = target_sprite.scale * shadow_scale
	
	# Position the shadow with offset
	shadow_sprite.position = shadow_offset
	
	# Set the shadow behind the ship but above background
	shadow_sprite.z_index = 3  # Ship sprite is at z_index 5, so shadow at 3
	
	# Add shadow as child of this node
	add_child(shadow_sprite)
	
	# Copy any additional sprite properties
	copy_sprite_properties()
	
	print("ShipShadow: Created shadow sprite - Color: ", shadow_sprite.modulate, " Position: ", shadow_sprite.position, " Z-index: ", shadow_sprite.z_index)

func copy_sprite_properties():
	if not target_sprite or not shadow_sprite:
		return
	
	# Copy rotation and other transform properties
	shadow_sprite.rotation = target_sprite.rotation
	shadow_sprite.flip_h = target_sprite.flip_h
	shadow_sprite.flip_v = target_sprite.flip_v
	
	# Copy texture region if used
	shadow_sprite.region_enabled = target_sprite.region_enabled
	if target_sprite.region_enabled:
		shadow_sprite.region_rect = target_sprite.region_rect

func _process(_delta):
	if shadow_sprite and target_sprite:
		# Keep shadow synchronized with the target sprite
		update_shadow_transform()

func update_shadow_transform():
	# Update shadow rotation to match target
	shadow_sprite.rotation = target_sprite.rotation
	shadow_sprite.flip_h = target_sprite.flip_h
	shadow_sprite.flip_v = target_sprite.flip_v
	
	# Apply offset (rotated based on ship's rotation for more realistic effect)
	var rotated_offset = shadow_offset.rotated(parent_ship.rotation)
	shadow_sprite.position = rotated_offset

# Public methods for customization
func set_shadow_offset(new_offset: Vector2):
	shadow_offset = new_offset

func set_shadow_color(new_color: Color):
	shadow_color = new_color
	if shadow_sprite:
		shadow_sprite.modulate = shadow_color

func set_shadow_scale(new_scale: float):
	shadow_scale = new_scale
	if shadow_sprite and target_sprite:
		shadow_sprite.scale = target_sprite.scale * shadow_scale

func show_shadow():
	if shadow_sprite:
		shadow_sprite.visible = true

func hide_shadow():
	if shadow_sprite:
		shadow_sprite.visible = false

# Static helper function to easily add shadow to any ship
static func add_to_ship(ship: Node2D, offset: Vector2 = Vector2(3, 3)) -> ShipShadow:
	var shadow = ShipShadow.new()
	shadow.shadow_offset = offset
	ship.add_child(shadow)
	return shadow