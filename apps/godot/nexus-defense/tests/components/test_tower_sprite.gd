extends GdUnitTestSuite

const TowerSprite := preload("res://ui/components/tower_sprite.gd")

var _sprite: Node2D

func before_test() -> void:
	_sprite = auto_free(TowerSprite.new())
	add_child(_sprite)
	await await_idle_frame()

func test_builds_color_rect_with_shader_material() -> void:
	var rect: ColorRect = _sprite.get("_rect")
	var mat: ShaderMaterial = _sprite.get("_mat")
	assert_object(rect).is_not_null()
	assert_object(mat).is_not_null()
	assert_object(rect.material).is_same(mat)

func test_sprite_centered_on_parent_origin() -> void:
	var rect: ColorRect = _sprite.get("_rect")
	var sz: Vector2 = _sprite.get("sprite_size")
	assert_that(rect.position).is_equal(-sz * 0.5)

func test_apply_id_maps_arrow_to_type_zero() -> void:
	_sprite.call("apply_id", "arrow")
	assert_int(int(_sprite.get("tower_type"))).is_equal(TowerSprite.TYPE_ARROW)
	assert_that(_sprite.get("accent_color")).is_equal(TowerSprite.ACCENT_FROM_ID["arrow"])

func test_apply_id_maps_cannon_frost_magic() -> void:
	_sprite.call("apply_id", "cannon")
	assert_int(int(_sprite.get("tower_type"))).is_equal(TowerSprite.TYPE_CANNON)
	_sprite.call("apply_id", "frost")
	assert_int(int(_sprite.get("tower_type"))).is_equal(TowerSprite.TYPE_FROST)
	_sprite.call("apply_id", "magic")
	assert_int(int(_sprite.get("tower_type"))).is_equal(TowerSprite.TYPE_MAGIC)

func test_apply_id_unknown_defaults_to_arrow() -> void:
	_sprite.call("apply_id", "no_such_tower")
	assert_int(int(_sprite.get("tower_type"))).is_equal(TowerSprite.TYPE_ARROW)

func test_setter_pushes_to_shader_uniform() -> void:
	_sprite.set("tower_type", TowerSprite.TYPE_FROST)
	var mat: ShaderMaterial = _sprite.get("_mat")
	assert_int(int(mat.get_shader_parameter("tower_type"))).is_equal(TowerSprite.TYPE_FROST)

func test_accent_setter_pushes_to_shader() -> void:
	var col := Color(0.2, 0.6, 0.4, 1.0)
	_sprite.set("accent_color", col)
	var mat: ShaderMaterial = _sprite.get("_mat")
	assert_that(mat.get_shader_parameter("accent_color")).is_equal(col)

func test_level_clamps_to_valid_range() -> void:
	_sprite.set("level", 10.0)
	assert_float(float(_sprite.get("level"))).is_equal_approx(3.0, 0.001)
	_sprite.set("level", 0.1)
	assert_float(float(_sprite.get("level"))).is_equal_approx(0.5, 0.001)

func test_apply_dict_routes_to_helpers() -> void:
	_sprite.call("apply", {"id": "magic", "level": 2.0, "size": Vector2(64, 64)})
	assert_int(int(_sprite.get("tower_type"))).is_equal(TowerSprite.TYPE_MAGIC)
	assert_float(float(_sprite.get("level"))).is_equal_approx(2.0, 0.001)
	assert_that(_sprite.get("sprite_size")).is_equal(Vector2(64, 64))

func test_sprite_size_setter_resizes_rect() -> void:
	_sprite.set("sprite_size", Vector2(80, 80))
	var rect: ColorRect = _sprite.get("_rect")
	assert_that(rect.size).is_equal(Vector2(80, 80))
	assert_that(rect.position).is_equal(Vector2(-40, -40))
