extends Node3D

@export var terrain_seed := 1337
@export var hill_amplitude := 4.0
@export var hill_base := 3.5
@export var hill_frequency := 0.008
@export var river_wander := 60.0
@export var river_wander_frequency := 0.004
@export var river_width := 7.0
@export var water_level := -1.4
@export var riverbed_depth := 1.2
@export var extent := 256.0
@export var resolution := 513
@export var player_path: NodePath
@export var grass_material: ShaderMaterial
@export var ground_material: ShaderMaterial
@export var water_material: ShaderMaterial

var _hills := FastNoiseLite.new()
var _river := FastNoiseLite.new()


func _ready() -> void:
	_hills.seed = terrain_seed
	_hills.frequency = hill_frequency
	_hills.fractal_octaves = 4
	_river.seed = terrain_seed + 7
	_river.frequency = river_wander_frequency

	var step := extent * 2.0 / float(resolution - 1)
	var img := Image.create(resolution, resolution, false, Image.FORMAT_RF)
	var heights := PackedFloat32Array()
	heights.resize(resolution * resolution)
	for iy in resolution:
		var z := -extent + float(iy) * step
		for ix in resolution:
			var x := -extent + float(ix) * step
			var h := height_at(x, z)
			img.set_pixel(ix, iy, Color(h, 0.0, 0.0))
			heights[iy * resolution + ix] = h

	var tex := ImageTexture.create_from_image(img)
	for m: ShaderMaterial in [grass_material, ground_material]:
		if m:
			m.set_shader_parameter("heightmap", tex)
			m.set_shader_parameter("terrain_extent", extent)
	if grass_material:
		grass_material.set_shader_parameter("water_level", water_level)

	var body := StaticBody3D.new()
	var col := CollisionShape3D.new()
	var shape := HeightMapShape3D.new()
	shape.map_width = resolution
	shape.map_depth = resolution
	shape.map_data = heights
	col.shape = shape
	body.add_child(col)
	add_child(body)

	var water := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(river_wander * 2.0 + river_width * 8.0, extent * 2.0)
	water.mesh = plane
	water.material_override = water_material
	water.position = Vector3(0.0, water_level, 0.0)
	water.extra_cull_margin = 16.0
	add_child(water)

	var player := get_node_or_null(player_path) as Node3D
	if player:
		var p := player.global_position
		var sx := p.x
		while height_at(sx, p.z) < water_level + 1.0 and sx < extent:
			sx += 4.0
		player.global_position = Vector3(sx, height_at(sx, p.z) + 1.0, p.z)


func height_at(x: float, z: float) -> float:
	var h := _hills.get_noise_2d(x, z) * hill_amplitude + hill_base
	var river_x := _river.get_noise_1d(z) * river_wander
	var d := absf(x - river_x)
	var t := exp(-(d * d) / (2.0 * river_width * river_width))
	return lerpf(h, water_level - riverbed_depth, clampf(t * 1.15, 0.0, 1.0))
