extends GdUnitTestSuite

const HudTop := preload("res://ui/components/hud_top.gd")

var _hud: Control

func before_test() -> void:
	_hud = auto_free(HudTop.new())
	add_child(_hud)
	await await_idle_frame()

func test_builds_subtree() -> void:
	assert_int(_hud.get_child_count()).is_greater(0)

func test_apply_updates_wave_lives_gold_enemies() -> void:
	_hud.call("apply", {"wave": 5, "lives": 17, "gold": 420, "enemies": 11})
	await await_idle_frame()
	assert_int(int(_hud.get("wave"))).is_equal(5)
	assert_int(int(_hud.get("lives"))).is_equal(17)
	assert_int(int(_hud.get("gold"))).is_equal(420)
	assert_int(int(_hud.get("enemies_left"))).is_equal(11)

func test_apply_partial_does_not_reset_other_fields() -> void:
	_hud.call("apply", {"wave": 3, "lives": 19, "gold": 100, "enemies": 4})
	await await_idle_frame()
	_hud.call("apply", {"gold": 250})
	await await_idle_frame()
	assert_int(int(_hud.get("wave"))).is_equal(3)
	assert_int(int(_hud.get("lives"))).is_equal(19)
	assert_int(int(_hud.get("gold"))).is_equal(250)

func test_apply_with_non_dict_is_noop() -> void:
	var before_gold: int = int(_hud.get("gold"))
	_hud.call("apply", "not a dict")
	await await_idle_frame()
	assert_int(int(_hud.get("gold"))).is_equal(before_gold)
