class_name ShipShadow
extends Node2D


@export var shadow_offset: Vector2 = Vector2(12, 12)
@export var shadow_color: Color = Color(0, 0, 0, 0.6)
@export var shadow_scale: float = 0.7
@export var auto_setup: bool = true

var shadow_sprite: Sprite2D
var target_sprite: Sprite2D
var parent_ship: Node2D

func _ready():
	if auto_setup:
		setup_shadow()

func setup_shadow():
	parent_ship = get_parent()
	if not parent_ship:
		print("ShipShadow: No parent found")
		return
	
	target_sprite = find_sprite_in_parent()
	if not target_sprite:
		print("ShipShadow: No sprite found in parent ship")
		return
	
	create_shadow_sprite()
	
	print("ShipShadow: Shadow created for ", parent_ship.name)

func find_sprite_in_parent() -> Sprite2D:
	var common_names = ["Sprite2D", "ShipSprite", "sprite", "body_sprite"]
	
	for name in common_names:
		var sprite = parent_ship.get_node_or_null(name)
		if sprite and sprite is Sprite2D:
			return sprite
	
	for child in parent_ship.get_children():
		if child is Sprite2D:
			return child
	
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
	
	shadow_sprite = Sprite2D.new()
	shadow_sprite.name = "Shadow"
	
	shadow_sprite.texture = target_sprite.texture
	
	shadow_sprite.modulate = shadow_color
	shadow_sprite.scale = target_sprite.scale * shadow_scale
	
	shadow_sprite.position = shadow_offset
	
	shadow_sprite.z_index = 3
	
	add_child(shadow_sprite)
	
	copy_sprite_properties()
	
	print("ShipShadow: Created shadow sprite - Color: ", shadow_sprite.modulate, " Position: ", shadow_sprite.position, " Z-index: ", shadow_sprite.z_index)

func copy_sprite_properties():
	if not target_sprite or not shadow_sprite:
		return
	
	shadow_sprite.rotation = target_sprite.rotation
	shadow_sprite.flip_h = target_sprite.flip_h
	shadow_sprite.flip_v = target_sprite.flip_v
	
	shadow_sprite.region_enabled = target_sprite.region_enabled
	if target_sprite.region_enabled:
		shadow_sprite.region_rect = target_sprite.region_rect

func _process(_delta):
	if shadow_sprite and target_sprite:
		update_shadow_transform()

func update_shadow_transform():
	shadow_sprite.rotation = target_sprite.rotation
	shadow_sprite.flip_h = target_sprite.flip_h
	shadow_sprite.flip_v = target_sprite.flip_v
	
	var rotated_offset = shadow_offset.rotated(parent_ship.rotation)
	shadow_sprite.position = rotated_offset

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

static func add_to_ship(ship: Node2D, offset: Vector2 = Vector2(3, 3)) -> ShipShadow:
	var shadow = ShipShadow.new()
	shadow.shadow_offset = offset
	ship.add_child(shadow)
	return shadow