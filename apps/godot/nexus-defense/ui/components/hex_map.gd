extends Node2D

const Tokens := preload("res://ui/lib/tokens.gd")

@export var radius: int = 6
@export var edge_length: float = 36.0
@export var fill_color: Color = Color(0.13, 0.16, 0.22)
@export var border_color: Color = Color(0.22, 0.26, 0.34)
@export var path_color: Color = Color(0.32, 0.78, 0.95, 0.35)
@export var hover_color: Color = Color(0.32, 0.78, 0.95, 0.55)
@export var hover_invalid_color: Color = Color(0.95, 0.42, 0.46, 0.55)
@export var path_axials: Array[Vector2i] = []
@export var occupied_axials: Array[Vector2i] = []

var hover_axial: Variant = null
var hover_valid: bool = true
var _hexes: Array[Vector2i] = []
var _occupied_lookup: Dictionary = {}

func _ready() -> void:
	_recompute_hexes()
	queue_redraw()

func _recompute_hexes() -> void:
	_hexes.clear()
	for q in range(-radius, radius + 1):
		var r_min: int = max(-radius, -q - radius)
		var r_max: int = min(radius, -q + radius)
		for r in range(r_min, r_max + 1):
			_hexes.append(Vector2i(q, r))

func axial_to_pixel(q: int, r: int) -> Vector2:
	var x: float = edge_length * sqrt(3.0) * (float(q) + float(r) / 2.0)
	var y: float = edge_length * 1.5 * float(r)
	return Vector2(x, y)

func pixel_to_axial(p: Vector2) -> Vector2i:
	var local: Vector2 = p - global_position
	var q_frac: float = (sqrt(3.0) / 3.0 * local.x - local.y / 3.0) / edge_length
	var r_frac: float = (2.0 / 3.0 * local.y) / edge_length
	return _axial_round(q_frac, r_frac)

func _axial_round(q: float, r: float) -> Vector2i:
	var s: float = -q - r
	var rq: float = round(q)
	var rr: float = round(r)
	var rs: float = round(s)
	var q_diff: float = abs(rq - q)
	var r_diff: float = abs(rr - r)
	var s_diff: float = abs(rs - s)
	if q_diff > r_diff and q_diff > s_diff:
		rq = -rr - rs
	elif r_diff > s_diff:
		rr = -rq - rs
	return Vector2i(int(rq), int(rr))

func contains_axial(axial: Vector2i) -> bool:
	var q: int = axial.x
	var r: int = axial.y
	if abs(q) > radius or abs(r) > radius:
		return false
	return abs(-q - r) <= radius

func _hex_corners(center: Vector2) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in 6:
		var angle: float = PI / 3.0 * float(i) - PI / 2.0
		pts.append(center + Vector2(cos(angle), sin(angle)) * edge_length)
	return pts

func _rebuild_occupied_lookup() -> void:
	_occupied_lookup.clear()
	for v in occupied_axials:
		_occupied_lookup[Vector2i(v.x, v.y)] = true

func _draw() -> void:
	var path_set: Dictionary = {}
	for v in path_axials:
		path_set[Vector2i(v.x, v.y)] = true
	if _occupied_lookup.is_empty() and not occupied_axials.is_empty():
		_rebuild_occupied_lookup()
	var hover_key: Variant = null
	if hover_axial != null:
		hover_key = Vector2i((hover_axial as Vector2i).x, (hover_axial as Vector2i).y)
	for axial in _hexes:
		var center: Vector2 = axial_to_pixel(axial.x, axial.y)
		var pts: PackedVector2Array = _hex_corners(center)
		var fill: Color = fill_color
		if path_set.has(axial):
			fill = path_color
		if hover_key != null and axial == hover_key:
			fill = hover_color if hover_valid else hover_invalid_color
		draw_colored_polygon(pts, fill)
		var closed_pts: PackedVector2Array = PackedVector2Array(pts)
		closed_pts.append(pts[0])
		draw_polyline(closed_pts, border_color, 1.5, true)

func set_path(axials: Array[Vector2i]) -> void:
	path_axials = axials
	queue_redraw()

func set_occupied(axials: Array[Vector2i]) -> void:
	occupied_axials = axials
	_rebuild_occupied_lookup()
	queue_redraw()

func set_hover(axial: Variant, valid: bool = true) -> void:
	if axial == null:
		if hover_axial == null:
			return
		hover_axial = null
		queue_redraw()
		return
	var v: Vector2i = axial
	if hover_axial == v and hover_valid == valid:
		return
	hover_axial = v
	hover_valid = valid
	queue_redraw()

func clear_hover() -> void:
	set_hover(null)

func is_axial_buildable(axial: Vector2i) -> bool:
	if not contains_axial(axial):
		return false
	if _occupied_lookup.is_empty() and not occupied_axials.is_empty():
		_rebuild_occupied_lookup()
	if _occupied_lookup.has(axial):
		return false
	return true
