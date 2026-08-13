extends Node

signal changed

const CONFIG_PATH := "user://gameplay.cfg"

enum CameraMode { FIRST, THIRD, SHOULDER }

const CAMERA_NAMES := [
	"settings.camera_name.first_person",
	"settings.camera_name.third_person",
	"settings.camera_name.over_shoulder",
]

var camera_mode := CameraMode.THIRD
var crosshair := true


func _ready() -> void:
	load_settings()
	apply.call_deferred()


func set_camera_mode(index: int) -> void:
	camera_mode = clampi(index, 0, CAMERA_NAMES.size() - 1) as CameraMode
	apply()


func cycle_camera_mode() -> void:
	set_camera_mode((camera_mode + 1) % CAMERA_NAMES.size())


func set_crosshair(enabled: bool) -> void:
	crosshair = enabled
	apply()


func apply() -> void:
	save_settings()
	changed.emit()


func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(CONFIG_PATH) != OK:
		return
	camera_mode = clampi(cfg.get_value("gameplay", "camera_mode", camera_mode), 0, CAMERA_NAMES.size() - 1) as CameraMode
	crosshair = cfg.get_value("gameplay", "crosshair", crosshair)


## Read before written: the chosen locale lives in this section too, and a
## fresh ConfigFile here would drop it every time the camera changed.
func save_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.load(CONFIG_PATH)
	cfg.set_value("gameplay", "camera_mode", int(camera_mode))
	cfg.set_value("gameplay", "crosshair", crosshair)
	cfg.save(CONFIG_PATH)
