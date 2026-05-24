extends GdUnitTestSuite

const BuildBar := preload("res://ui/components/build_bar.gd")

var _bar: Control

func before_test() -> void:
	_bar = auto_free(BuildBar.new())
	add_child(_bar)
	await await_idle_frame()

func test_default_towers_populated() -> void:
	var towers: Array = _bar.get("towers")
	assert_int(towers.size()).is_equal(4)
	var ids: Array = []
	for t in towers:
		ids.append(String(t["id"]))
	assert_array(ids).contains(["arrow"])
	assert_array(ids).contains(["cannon"])
	assert_array(ids).contains(["frost"])
	assert_array(ids).contains(["magic"])

func test_apply_gold_updates_affordability() -> void:
	_bar.call("apply", {"gold": 0})
	await await_idle_frame()
	var buttons: Dictionary = _bar.get("_buttons")
	for id in buttons.keys():
		var entry: Dictionary = buttons[id]
		assert_bool((entry["button"] as Button).disabled).is_true()

	_bar.call("apply", {"gold": 9999})
	await await_idle_frame()
	buttons = _bar.get("_buttons")
	for id in buttons.keys():
		var entry: Dictionary = buttons[id]
		assert_bool((entry["button"] as Button).disabled).is_false()

func test_apply_custom_tower_list() -> void:
	var custom: Array = [
		{"id": "laser", "label": "Laser", "icon": "L", "cost": 10, "accent": Color.RED},
		{"id": "sonic", "label": "Sonic", "icon": "S", "cost": 20, "accent": Color.BLUE},
	]
	_bar.call("apply", {"towers": custom, "gold": 50})
	await await_idle_frame()
	var towers: Array = _bar.get("towers")
	assert_int(towers.size()).is_equal(2)
	var buttons: Dictionary = _bar.get("_buttons")
	assert_bool(buttons.has("laser")).is_true()
	assert_bool(buttons.has("sonic")).is_true()

func test_select_then_select_again_cancels() -> void:
	var monitor: Variant = monitor_signals(_bar, false)
	_bar.call("_on_tower_pressed", "arrow")
	assert_str(String(_bar.get("selected_id"))).is_equal("arrow")
	_bar.call("_on_tower_pressed", "arrow")
	assert_str(String(_bar.get("selected_id"))).is_equal("")
	await assert_signal(monitor).is_emitted("tower_selected", ["arrow"])
	await assert_signal(monitor).is_emitted("tower_canceled")

func test_select_switches_active_id() -> void:
	_bar.call("_on_tower_pressed", "arrow")
	_bar.call("_on_tower_pressed", "frost")
	assert_str(String(_bar.get("selected_id"))).is_equal("frost")
