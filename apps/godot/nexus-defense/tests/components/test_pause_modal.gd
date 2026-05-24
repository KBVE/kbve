extends GdUnitTestSuite

const PauseModal := preload("res://ui/components/pause_modal.gd")

func before_test() -> void:
	get_tree().paused = false

func after_test() -> void:
	get_tree().paused = false

func test_pause_modal_pauses_tree_on_build() -> void:
	var m: Control = auto_free(PauseModal.new())
	add_child(m)
	await await_idle_frame()
	assert_bool(get_tree().paused).is_true()

func test_resume_action_unpauses() -> void:
	var m: Control = PauseModal.new()
	add_child(m)
	await await_idle_frame()
	assert_bool(get_tree().paused).is_true()
	m.call("_on_action", "resume")
	await get_tree().create_timer(0.2).timeout
	assert_bool(get_tree().paused).is_false()

func test_action_signal_emitted_for_each_verb() -> void:
	var m: Control = auto_free(PauseModal.new())
	add_child(m)
	await await_idle_frame()
	var monitor: Variant = monitor_signals(m, false)
	m.call("_on_action", "settings")
	await assert_signal(monitor).is_emitted("action", ["settings"])
