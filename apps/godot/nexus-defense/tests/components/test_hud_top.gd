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

func test_chip_boxes_registered_for_all_tags() -> void:
	var boxes: Dictionary = _hud.get("_chip_boxes")
	for tag in ["wave", "lives", "gold", "enemies"]:
		assert_bool(boxes.has(tag)).is_true()
		assert_object(boxes[tag]).is_instanceof(PanelContainer)

func test_gold_increase_kicks_off_punch_and_flash_tweens() -> void:
	_hud.call("apply", {"gold": 100})
	await await_idle_frame()
	_hud.call("apply", {"gold": 250})
	var tweens: Dictionary = _hud.get("_active_tweens")
	assert_bool(tweens.has("gold")).is_true()
	assert_bool(tweens.has("punch_gold")).is_true()
	assert_bool(tweens.has("flash_gold")).is_true()

func test_gold_decrease_skips_flash_and_punch() -> void:
	_hud.call("apply", {"gold": 300})
	await await_idle_frame()
	var tweens: Dictionary = _hud.get("_active_tweens")
	tweens.clear()
	_hud.call("apply", {"gold": 100})
	tweens = _hud.get("_active_tweens")
	assert_bool(tweens.has("gold")).is_true()
	assert_bool(tweens.has("punch_gold")).is_false()
	assert_bool(tweens.has("flash_gold")).is_false()

func test_lives_decrease_triggers_flash_and_punch() -> void:
	_hud.call("apply", {"lives": 20})
	await await_idle_frame()
	_hud.call("apply", {"lives": 18})
	var tweens: Dictionary = _hud.get("_active_tweens")
	assert_bool(tweens.has("flash_lives")).is_true()
	assert_bool(tweens.has("punch_lives")).is_true()

func test_lives_increase_skips_flash_and_punch() -> void:
	_hud.call("apply", {"lives": 10})
	await await_idle_frame()
	var tweens: Dictionary = _hud.get("_active_tweens")
	tweens.clear()
	_hud.call("apply", {"lives": 15})
	tweens = _hud.get("_active_tweens")
	assert_bool(tweens.has("flash_lives")).is_false()
	assert_bool(tweens.has("punch_lives")).is_false()

func test_wave_change_triggers_punch_and_flash() -> void:
	_hud.call("apply", {"wave": 1})
	await await_idle_frame()
	_hud.call("apply", {"wave": 2})
	var tweens: Dictionary = _hud.get("_active_tweens")
	assert_bool(tweens.has("punch_wave")).is_true()
	assert_bool(tweens.has("flash_wave")).is_true()

func test_unchanged_value_does_not_animate() -> void:
	_hud.call("apply", {"gold": 150})
	await await_idle_frame()
	# Drain any tweens from initial state
	var tweens: Dictionary = _hud.get("_active_tweens")
	tweens.clear()
	_hud.call("apply", {"gold": 150})
	tweens = _hud.get("_active_tweens")
	assert_bool(tweens.has("punch_gold")).is_false()
	assert_bool(tweens.has("flash_gold")).is_false()

func test_int_tween_writes_label_text_eventually() -> void:
	_hud.call("apply", {"gold": 50})
	await await_idle_frame()
	_hud.call("apply", {"gold": 100})
	await get_tree().create_timer(0.5).timeout
	var gold_label: Label = _hud.get("_gold_value")
	assert_str(gold_label.text).is_equal("100")
