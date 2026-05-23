class_name HexGrid
extends RefCounted

## Hex Grid utility for pointy-top hexagons
## Uses axial coordinates (q, r) internally
##
## Corner layout (pointy-top):
##         B (0)
##     /        \
##    A (5)      C (1)
##    |          |
##    F (4)      D (2)
##     \        /
##         E (3)

const EDGE_LENGTH: float = 24.0  # Larger hexes for more terrain per tile
const WIDTH: float = EDGE_LENGTH * 1.732050808  # sqrt(3) * edge ≈ 41.6
const HEIGHT: float = EDGE_LENGTH * 2.0  # 48.0

# Hex corner indices
enum Corner { B = 0, C = 1, D = 2, E = 3, F = 4, A = 5 }

# Axial direction vectors for the 6 neighbors (pointy-top)
const DIRECTIONS: Array[Vector2i] = [
	Vector2i(1, 0),   # East
	Vector2i(1, -1),  # Northeast
	Vector2i(0, -1),  # Northwest
	Vector2i(-1, 0),  # West
	Vector2i(-1, 1),  # Southwest
	Vector2i(0, 1),   # Southeast
]

# Corner angles for pointy-top hex (starting from top, going clockwise)
const CORNER_ANGLES: Array[float] = [
	-PI / 2,          # B - top (270° or -90°)
	-PI / 6,          # C - top-right (330° or -30°)
	PI / 6,           # D - bottom-right (30°)
	PI / 2,           # E - bottom (90°)
	5 * PI / 6,       # F - bottom-left (150°)
	-5 * PI / 6,      # A - top-left (210° or -150°)
]


## Convert axial coordinates (q, r) to world position (x, z)
static func axial_to_world(q: int, r: int) -> Vector3:
	var x = EDGE_LENGTH * sqrt(3.0) * (q + r / 2.0)
	var z = EDGE_LENGTH * 1.5 * r
	return Vector3(x, 0, z)


## Convert world position to axial coordinates
static func world_to_axial(world_pos: Vector3) -> Vector2i:
	var q = (sqrt(3.0) / 3.0 * world_pos.x - 1.0 / 3.0 * world_pos.z) / EDGE_LENGTH
	var r = (2.0 / 3.0 * world_pos.z) / EDGE_LENGTH
	return axial_round(q, r)


## Round fractional axial coordinates to nearest hex
static func axial_round(q: float, r: float) -> Vector2i:
	var s = -q - r
	var rq = round(q)
	var rr = round(r)
	var rs = round(s)

	var q_diff = abs(rq - q)
	var r_diff = abs(rr - r)
	var s_diff = abs(rs - s)

	if q_diff > r_diff and q_diff > s_diff:
		rq = -rr - rs
	elif r_diff > s_diff:
		rr = -rq - rs

	return Vector2i(int(rq), int(rr))


## Get the 6 neighboring hex coordinates
static func get_neighbors(q: int, r: int) -> Array[Vector2i]:
	var neighbors: Array[Vector2i] = []
	for dir in DIRECTIONS:
		neighbors.append(Vector2i(q + dir.x, r + dir.y))
	return neighbors


## Get neighbor in a specific direction (0-5)
static func get_neighbor(q: int, r: int, direction: int) -> Vector2i:
	var dir = DIRECTIONS[direction % 6]
	return Vector2i(q + dir.x, r + dir.y)


## Get world position of a specific corner (0-5, or use Corner enum)
static func get_corner_world(q: int, r: int, corner_index: int) -> Vector3:
	var center = axial_to_world(q, r)
	var angle = CORNER_ANGLES[corner_index % 6]
	return Vector3(
		center.x + EDGE_LENGTH * cos(angle),
		center.y,
		center.z + EDGE_LENGTH * sin(angle)
	)


## Get all 6 corner world positions for a hex
static func get_all_corners_world(q: int, r: int) -> Array[Vector3]:
	var corners: Array[Vector3] = []
	for i in 6:
		corners.append(get_corner_world(q, r, i))
	return corners


## Get the two corners that form an edge (edge_index 0-5)
static func get_edge_corners(edge_index: int) -> Array[int]:
	return [edge_index, (edge_index + 1) % 6]


## Get world positions for an edge's two endpoints
static func get_edge_world(q: int, r: int, edge_index: int) -> Array[Vector3]:
	var corners = get_edge_corners(edge_index)
	return [
		get_corner_world(q, r, corners[0]),
		get_corner_world(q, r, corners[1])
	]


## Calculate distance between two hexes (in hex steps)
static func hex_distance(q1: int, r1: int, q2: int, r2: int) -> int:
	return (abs(q1 - q2) + abs(q1 + r1 - q2 - r2) + abs(r1 - r2)) / 2


## Get all hexes within a radius (ring)
static func get_hexes_in_radius(center_q: int, center_r: int, radius: int) -> Array[Vector2i]:
	var results: Array[Vector2i] = []
	for q in range(-radius, radius + 1):
		for r in range(max(-radius, -q - radius), min(radius, -q + radius) + 1):
			results.append(Vector2i(center_q + q, center_r + r))
	return results


## Get hexes in a ring at exactly the given radius
static func get_hex_ring(center_q: int, center_r: int, radius: int) -> Array[Vector2i]:
	if radius == 0:
		return [Vector2i(center_q, center_r)]

	var results: Array[Vector2i] = []
	var hex = Vector2i(center_q + DIRECTIONS[4].x * radius, center_r + DIRECTIONS[4].y * radius)

	for i in 6:
		for _j in radius:
			results.append(hex)
			hex = Vector2i(hex.x + DIRECTIONS[i].x, hex.y + DIRECTIONS[i].y)

	return results


## Create a unique key for a hex coordinate (for dictionaries)
static func hex_key(q: int, r: int) -> int:
	# Cantor pairing function (works for negative coords with offset)
	var qq = q + 10000
	var rr = r + 10000
	return (qq + rr) * (qq + rr + 1) / 2 + rr
