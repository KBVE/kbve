extends Node3D

## Title screen: the seeded world drifting behind a button column.
##
## The backdrop is the real world generator, not a render of one — same
## QTerrain, same materials, same sky — so it costs what the game costs and is
## worth keeping honest about. Quality comes from the saved tier exactly as it
## does in `main.gd`: latched in `_enter_tree`, because the fields read it as an
## export during their own `_ready`.
##
## Settings reuse the pause menu rather than growing a second copy of the
## graphics and gameplay pages. That menu pauses the tree when it opens, which
## is why the camera rig and this layer run with PROCESS_MODE_ALWAYS.

const GFX := preload("res://src/settings/graphics_settings.gd")
const PAUSE_MENU := preload("res://src/ui/pause_menu.gd")

@onready var _menu: TitleMenu = $TitleMenu

var _settings: CanvasLayer


func _enter_tree() -> void:
	GFX.apply_fields(self, GFX.saved_tier())


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	# The title is the one screen with no camera to steer, so the cursor is a
	# cursor here even if the world scene captured it before returning.
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_menu.play_requested.connect(_play_as_guest)
	_menu.settings_requested.connect(_open_settings)
	_menu.quit_requested.connect(_quit)
	_menu.cancel_requested.connect(_cancel)


func _play_as_guest() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth:
		auth.sign_in_as_guest()
	get_tree().change_scene_to_file(TitleMenu.WORLD_SCENE)


## Built on first use: the book is a SubViewport with its own 3D world, and
## paying for it on a screen the player may walk straight past is the kind of
## load-time cost that never shows up in a profile of the world itself.
func _open_settings() -> void:
	if _settings == null:
		_settings = CanvasLayer.new()
		_settings.set_script(PAUSE_MENU)
		_settings.toggles_on_cancel = false
		_settings.captures_mouse_on_close = false
		add_child(_settings)
		# The menu builds its book during _ready; opening in the same frame
		# would race the SubViewport's first fit.
		await get_tree().process_frame
	_settings.open_settings()


## Escape backs out of the settings book before it quits — a key that sometimes
## closes a panel and sometimes exits the process is one nobody presses twice.
func _cancel() -> void:
	if _settings and _settings.is_open():
		_settings.close()
		return
	_quit()


func _quit() -> void:
	get_tree().quit()
