extends Node


const SPIKE_RATIO := 1.8
const SPIKE_FLOOR_MS := 8.0
const WARMUP_FRAMES := 120
const TAIL_FRAMES := 6
const SUMMARY_SECONDS := 15.0

@export var player_path: NodePath

var _enabled := false
var _player: Node3D
var _frame := 0
var _avg_ms := 16.0
var _tail := 0
var _worst_ms := 0.0
var _worst_pos := Vector3.ZERO
var _spikes := 0
var _since_summary := 0.0
var _window_worst := 0.0

func _ready() -> void:
	_enabled = OS.get_environment("Q_PROFILE") == "1"
	if not _enabled:
		set_process(false)
		return
	_player = get_node_or_null(player_path) as Node3D
	print("[watch] frame watchdog armed: ratio %.1fx floor %.0fms" % [SPIKE_RATIO, SPIKE_FLOOR_MS])

func _process(delta: float) -> void:
	_frame += 1
	var ms := delta * 1000.0
	if _frame < WARMUP_FRAMES:
		_avg_ms = lerpf(_avg_ms, ms, 0.1)
		return

	if ms > _worst_ms:
		_worst_ms = ms
		if is_instance_valid(_player):
			_worst_pos = _player.global_position
	_window_worst = maxf(_window_worst, ms)
	_since_summary += delta
	if _since_summary >= SUMMARY_SECONDS:
		print("[watch] %.0fs baseline %.1fms worst-in-window %.1fms spikes %d" % [
			SUMMARY_SECONDS, _avg_ms, _window_worst, _spikes,
		])
		_since_summary = 0.0
		_window_worst = 0.0

	var spiked := ms > SPIKE_FLOOR_MS and ms > _avg_ms * SPIKE_RATIO
	if spiked:
		_spikes += 1
		_report("SPIKE", ms)
		_tail = TAIL_FRAMES
	elif _tail > 0:
		_tail -= 1
		_report("after", ms)

	if not spiked:
		_avg_ms = lerpf(_avg_ms, ms, 0.05)

func _report(tag: String, ms: float) -> void:
	var p := Vector3.ZERO
	if is_instance_valid(_player):
		p = _player.global_position
	print("[watch] %s f=%d %.1fms (avg %.1f) proc=%.2f phys=%.2f draws=%d objs=%d prims=%d pairs=%d active=%d islands=%d pos=(%.0f,%.0f,%.0f)" % [
		tag,
		_frame,
		ms,
		_avg_ms,
		Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
		Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
		int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
		int(Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)),
		int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)),
		int(Performance.get_monitor(Performance.PHYSICS_3D_COLLISION_PAIRS)),
		int(Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS)),
		int(Performance.get_monitor(Performance.PHYSICS_3D_ISLAND_COUNT)),
		p.x, p.y, p.z,
	])

func _exit_tree() -> void:
	if _enabled:
		print("[watch] worst frame %.1fms at (%.0f,%.0f,%.0f) — %d spikes over %d frames" % [
			_worst_ms, _worst_pos.x, _worst_pos.y, _worst_pos.z, _spikes, _frame,
		])
