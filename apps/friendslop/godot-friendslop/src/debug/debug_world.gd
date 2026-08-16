extends Node3D

@export var unshade_player := true
@export var disable_ink_lines := true

const INK_PATH := ^"Pivot/Camera3D/InkLines"

var _flat_ground: Node3D
var _ink: Node


func _ready() -> void:
	_flat_ground = get_node_or_null(^"Ground")
	var player := get_node_or_null(^"Player")
	if player:
		_ink = player.get_node_or_null(INK_PATH)
		if _ink and disable_ink_lines:
			_ink.visible = false
		if unshade_player:
			_unshade(player)
	sync_flat_ground()


func sync_flat_ground() -> void:
	if _flat_ground == null:
		return
	var terrain := get_node_or_null(^"Terrain") as Node3D
	var need_flat := terrain == null or not terrain.visible
	_flat_ground.visible = need_flat
	_flat_ground.process_mode = (
		Node.PROCESS_MODE_INHERIT if need_flat else Node.PROCESS_MODE_DISABLED
	)
	var shape := _flat_ground.get_node_or_null(^"CollisionShape3D") as CollisionShape3D
	if shape:
		shape.disabled = not need_flat


func _unshade(node: Node) -> void:
	var plain := StandardMaterial3D.new()
	plain.albedo_color = Color(0.82, 0.72, 0.64)
	for child in node.find_children("*", "GeometryInstance3D", true, false):
		var geo := child as GeometryInstance3D
		geo.material_override = plain
