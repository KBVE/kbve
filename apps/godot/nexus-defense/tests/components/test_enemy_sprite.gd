extends GdUnitTestSuite

const EnemySprite := preload("res://ui/components/enemy_sprite.gd")

var _enemy: Node2D

func before_test() -> void:
	_enemy = auto_free(EnemySprite.new())
	add_child(_enemy)
	await await_idle_frame()

func test_builds_rect_and_shader_material() -> void:
	var rect: ColorRect = _enemy.get("_rect")
	var mat: ShaderMaterial = _enemy.get("_mat")
	assert_object(rect).is_not_null()
	assert_object(mat).is_not_null()
	assert_object(rect.material).is_same(mat)

func test_sprite_centered_on_node() -> void:
	var rect: ColorRect = _enemy.get("_rect")
	var sz: Vector2 = _enemy.get("sprite_size")
	assert_that(rect.position).is_equal(-sz * 0.5)

func test_sample_path_returns_first_point_at_t_zero() -> void:
	var pts := PackedVector2Array([Vector2(0, 0), Vector2(100, 0), Vector2(100, 100)])
	_enemy.set("path_points", pts)
	var got: Vector2 = _enemy.call("_sample_path", 0.0)
	assert_that(got).is_equal(Vector2(0, 0))

func test_sample_path_returns_last_point_at_t_one() -> void:
	var pts := PackedVector2Array([Vector2(0, 0), Vector2(100, 0), Vector2(100, 100)])
	_enemy.set("path_points", pts)
	var got: Vector2 = _enemy.call("_sample_path", 1.0)
	assert_that(got).is_equal(Vector2(100, 100))

func test_sample_path_midpoint_between_segments() -> void:
	var pts := PackedVector2Array([Vector2(0, 0), Vector2(100, 0)])
	_enemy.set("path_points", pts)
	var got: Vector2 = _enemy.call("_sample_path", 0.5)
	assert_that(got).is_equal(Vector2(50, 0))

func test_start_with_single_point_does_not_run() -> void:
	var pts := PackedVector2Array([Vector2(0, 0)])
	_enemy.call("start", pts, 1.0)
	assert_bool(bool(_enemy.get("_running"))).is_false()

func test_start_positions_at_first_point() -> void:
	var pts := PackedVector2Array([Vector2(20, 30), Vector2(100, 30)])
	_enemy.call("start", pts, 1.0)
	assert_that(_enemy.position).is_equal(Vector2(20, 30))

func test_radius_clamps_to_valid_range() -> void:
	_enemy.set("radius_px", 100.0)
	assert_float(float(_enemy.get("radius_px"))).is_equal_approx(16.0, 0.001)
	_enemy.set("radius_px", 1.0)
	assert_float(float(_enemy.get("radius_px"))).is_equal_approx(4.0, 0.001)

func test_start_with_valid_path_marks_running() -> void:
	var pts := PackedVector2Array([Vector2(0, 0), Vector2(40, 0)])
	_enemy.call("start", pts, 1.0)
	assert_bool(bool(_enemy.get("_running"))).is_true()
	assert_float(float(_enemy.get("duration"))).is_equal_approx(1.0, 0.001)

func test_process_advances_along_path() -> void:
	var pts := PackedVector2Array([Vector2(0, 0), Vector2(100, 0)])
	_enemy.call("start", pts, 1.0)
	_enemy.call("_process", 0.5)
	assert_float(_enemy.position.x).is_greater(10.0)
	assert_float(_enemy.position.x).is_less(100.0)
