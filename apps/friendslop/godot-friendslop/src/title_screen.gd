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

## The backdrop runs none of what the world scene runs — no player, no physics
## step, no creatures, and none of the tree, flora, shrub or rock fields — so the
## grass gets the frame those systems are not spending. Relative to the tier
## rather than absolute: a phone on Low still gets a phone's worth of grass,
## there is simply more of it, and the tier stays the thing the player controls.
const GRASS_BOOST := 1.8
## Distance is the cheaper half of the same effect — the orbit looks out over the
## valley, so grass that stops short reads as a bald ring around the camera.
const RANGE_BOOST := 1.35

@onready var _menu: TitleMenu = $TitleMenu

var _settings: CanvasLayer


func _enter_tree() -> void:
	var tier := GFX.saved_tier()
	GFX.apply_fields(self, tier)
	_boost_grass(GFX.TIERS[tier].grass.blades_per_sqm, tier)


## Ranges come from a tier row, but the player may be on Custom — a preset index
## past the end of the table. Falling back to the last row would hand a potato's
## density Epic's draw distance, so Custom picks the row its density sits nearest.
static func _grass_row(blades: float, tier: int) -> Dictionary:
	if tier >= 0 and tier < GFX.TIERS.size():
		return GFX.TIERS[tier].grass
	var best := 0
	for i in GFX.TIERS.size():
		var here: float = absf(GFX.TIERS[i].grass.blades_per_sqm - blades)
		if here < absf(GFX.TIERS[best].grass.blades_per_sqm - blades):
			best = i
	return GFX.TIERS[best].grass


## Grass values the title asks for, given what the tier asked for. Pure so the
## boost is testable without a world: `blades` is whatever the player currently
## has (the tier's, or a custom value they dragged to), `tier` picks the ranges.
static func boosted_grass(blades: float, tier: int, boost: float, range_boost: float) -> Dictionary:
	var row: Dictionary = _grass_row(blades, tier)
	return {
		"blades_per_sqm": clampf(blades * boost, 10.0, 600.0),
		"blade_range": row.blade_range * range_boost,
		"thin_start": row.thin_start * range_boost,
		"grass_fade_out_end": row.grass_fade_out_end * range_boost,
	}


## Phones do not have the frame to give away. The systems the title is not
## running are the ones a desktop was spending its budget on; on mobile the
## budget was already gone before the title had anything to spare.
static func boost_factors() -> Array:
	if OS.has_feature("mobile"):
		return [1.0, 1.0]
	return [GRASS_BOOST, RANGE_BOOST]


func _boost_grass(blades: float, tier: int) -> void:
	var grass := get_node_or_null(^"GrassField")
	if grass == null:
		return
	var factors := boost_factors()
	var boosted := boosted_grass(blades, tier, factors[0], factors[1])
	for key in boosted:
		grass.set(key, boosted[key])


## `GraphicsSettings.apply()` writes the tier's own density straight onto the
## field, so the boost has to be re-applied after it rather than once at startup
## — otherwise changing any setting quietly halves the grass.
func _on_graphics_changed() -> void:
	var gfx := get_node_or_null(^"GraphicsSettings")
	if gfx:
		_boost_grass(gfx.grass_blades, gfx.preset_index())


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var gfx := get_node_or_null(^"GraphicsSettings")
	if gfx:
		gfx.changed.connect(_on_graphics_changed)
	# The title is the one screen with no camera to steer, so the cursor is a
	# cursor here even if the world scene captured it before returning.
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_menu.play_requested.connect(_play)
	_menu.sign_in_requested.connect(_sign_in)
	_menu.sign_out_requested.connect(_sign_out)
	_menu.solo_requested.connect(_play_solo)
	_menu.settings_requested.connect(_open_settings)
	_menu.quit_requested.connect(_quit)
	_menu.cancel_requested.connect(_cancel)
	_menu.locale_requested.connect(_switch_locale)
	_ask_language_once()


## First launch only. The boot locale is a guess made from the device, and this
## is where the guess becomes an answer -- after which the saved answer stands
## and the title's own row is how it changes.
func _ask_language_once() -> void:
	if I18n.has_choice() or I18n.locales().size() < 2:
		return
	var modal := LanguageModal.new()
	modal.chosen.connect(_on_language_chosen)
	add_child(modal)


func _on_language_chosen(code: String) -> void:
	# Reloaded rather than closed: the title behind was built in the guessed
	# language, and every label on it was set once.
	if code == I18n.locale_code():
		get_tree().reload_current_scene()
		return
	_switch_locale(code)


## Reloaded rather than relabelled: the menu, the settings book and the HUD all
## build their strings once, in whatever language was current at the time. The
## title is cheap to rebuild and is the only screen offering this, so nothing
## in progress is lost by starting it again.
func _switch_locale(code: String) -> void:
	if code == I18n.locale_code():
		return
	I18n.set_locale(code, true)
	get_tree().reload_current_scene()


## Signs in before the scene swaps so the session scene finds an identity
## already in place rather than having to invent one on arrival. An account that
## is already signed in is left alone — pressing Play does not sign you out.
func _play() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth and not auth.is_signed_in():
		auth.sign_in_as_guest()
	_enter(TitleMenu.ONLINE_SCENE)


## Owned here rather than in the menu so the form stays a form: it collects two
## strings and shows what it is told, and never learns what a token is.
func _sign_in(email: String, password: String) -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth == null:
		_menu.sign_in_failed("Sign-in is unavailable in this build.")
		return
	if await auth.sign_in(email, password) == OK:
		_menu.sign_in_succeeded()
	else:
		_menu.sign_in_failed(auth.last_error())


func _sign_out() -> void:
	var auth := get_node_or_null(^"/root/Auth")
	if auth:
		auth.sign_out()


## The offline world. Nothing to sign in to — it is this machine's own sim, and
## the terrain is whatever this machine generated.
func _play_solo() -> void:
	_enter(TitleMenu.WORLD_SCENE)


## Leaving the title is where the other languages' fonts stop being worth their
## memory: the picker was the only thing that needed them all, and the world has
## no picker.
func _enter(scene: String) -> void:
	I18n.use_locale_font()
	get_tree().change_scene_to_file(scene)


## Built on first use: the book is a SubViewport with its own 3D world, and
## paying for it on a screen the player may walk straight past is the kind of
## load-time cost that never shows up in a profile of the world itself.
func _open_settings() -> void:
	if _settings == null:
		_settings = CanvasLayer.new()
		_settings.set_script(PAUSE_MENU)
		_settings.toggles_on_cancel = false
		_settings.captures_mouse_on_close = false
		_settings.shows_session_actions = false
		add_child(_settings)
		# The menu builds its book during _ready; opening in the same frame
		# would race the SubViewport's first fit.
		await get_tree().process_frame
	_settings.open_settings()


## Escape backs out of the settings book before it quits — a key that sometimes
## closes a panel and sometimes exits the process is one nobody presses twice.
func _cancel() -> void:
	if _menu.is_signing_in():
		_menu.close_sign_in()
		return
	if _settings and _settings.is_open():
		_settings.close()
		return
	_quit()


func _quit() -> void:
	get_tree().quit()
