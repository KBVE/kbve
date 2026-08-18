class_name AccountCard
extends VBoxContainer


const AVATAR_PX := 64
const AVATAR_DIR := "user://avatars"
const LEGACY_AVATAR_CACHE := "user://avatar.png"
const CACHE_KEEP := 4
const CACHE_MAX_AGE := 604800
const M_THRESHOLD := 10000000

var avatar: TextureRect
var name_label: Label
var wallet_label: Label

var _request: HTTPRequest
var _avatar_url := ""
var _shown_url := ""


func _ready() -> void:
	add_theme_constant_override("separation", 6)
	_build()


func _build() -> void:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 10)
	add_child(row)

	avatar = TextureRect.new()
	avatar.custom_minimum_size = Vector2(AVATAR_PX, AVATAR_PX)
	avatar.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	avatar.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	row.add_child(avatar)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 2)
	row.add_child(column)

	name_label = _line(column, 18)
	wallet_label = _line(column, 13)
	wallet_label.mouse_filter = Control.MOUSE_FILTER_STOP


func _line(parent: Control, size: int) -> Label:
	var label := PaperLabel.card(size)
	parent.add_child(label)
	return label


func show_account(username: String) -> void:
	visible = true
	name_label.text = username if not username.is_empty() else "signed in"
	wallet_label.text = I18n.t("account.loading")


func show_wallet(credits: int, khash: int) -> void:
	wallet_label.text = I18n.t("account.wallet").format({
		"credits": _abbreviated(credits),
		"khash": _abbreviated(khash),
	})
	wallet_label.tooltip_text = I18n.t("account.wallet").format({
		"credits": _grouped(credits),
		"khash": _grouped(khash),
	})
	wallet_label.modulate = Color(1, 1, 1, 1)


func show_wallet_error(reason: String) -> void:
	wallet_label.text = reason
	wallet_label.tooltip_text = ""
	wallet_label.modulate = Color(1.0, 0.75, 0.55)


static func _abbreviated(value: int) -> String:
	var size := absi(value)
	if size < 1000:
		return _grouped(value)
	var sign_text := "-" if value < 0 else ""
	if size < M_THRESHOLD:
		return sign_text + str(size / 1000) + "K"
	return sign_text + _trimmed(snappedf(float(size) / 1000000.0, 0.1)) + "M"


static func _trimmed(value: float) -> String:
	var text := "%.1f" % value
	return text.trim_suffix(".0")


static func _grouped(value: int) -> String:
	var digits := str(absi(value))
	var out := ""
	var count := 0
	for i in range(digits.length() - 1, -1, -1):
		out = digits[i] + out
		count += 1
		if count % 3 == 0 and i > 0:
			out = "," + out
	return ("-" if value < 0 else "") + out


func load_avatar(url: String) -> bool:
	if url.is_empty() or not url.begins_with("https://"):
		return false
	if _shown_url == url:
		return false
	if _show_cached(url):
		return false
	avatar.texture = null
	if _request == null:
		_request = HTTPRequest.new()
		_request.timeout = 10.0
		add_child(_request)
		_request.request_completed.connect(_on_avatar)
	if _avatar_url == url:
		return false
	if not _avatar_url.is_empty():
		_request.cancel_request()
	_avatar_url = url
	return _request.request(url) == OK


static func cache_path(url: String) -> String:
	return "%s/%s.png" % [AVATAR_DIR, url.sha256_text().substr(0, 16)]


func _show_cached(url: String) -> bool:
	var path := cache_path(url)
	if not FileAccess.file_exists(path):
		return false
	if _age_of(path) > CACHE_MAX_AGE:
		return false
	var image := Image.new()
	if image.load(ProjectSettings.globalize_path(path)) != OK:
		return false
	avatar.texture = ImageTexture.create_from_image(image)
	_shown_url = url
	return true


static func _age_of(path: String) -> int:
	var stamp := FileAccess.get_modified_time(ProjectSettings.globalize_path(path))
	if stamp <= 0:
		return 0
	return maxi(0, int(Time.get_unix_time_from_system()) - stamp)


static func _prune() -> void:
	var dir := DirAccess.open(AVATAR_DIR)
	if dir == null:
		return
	var files: Array[Dictionary] = []
	for name in dir.get_files():
		var path := "%s/%s" % [AVATAR_DIR, name]
		files.append({
			"path": path,
			"at": FileAccess.get_modified_time(ProjectSettings.globalize_path(path)),
		})
	if files.size() <= CACHE_KEEP:
		return
	files.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["at"] > b["at"])
	for i in range(CACHE_KEEP, files.size()):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(files[i]["path"]))


func _on_avatar(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var url := _avatar_url
	_avatar_url = ""
	if result != HTTPRequest.RESULT_SUCCESS or code != 200 or body.is_empty():
		return
	var image := Image.new()
	if image.load_png_from_buffer(body) != OK and image.load_jpg_from_buffer(body) != OK:
		return
	avatar.texture = ImageTexture.create_from_image(image)
	_shown_url = url
	_write_cache(image, url)


func _write_cache(image: Image, url: String) -> void:
	if url.is_empty():
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(AVATAR_DIR))
	if image.save_png(ProjectSettings.globalize_path(cache_path(url))) != OK:
		return
	if FileAccess.file_exists(LEGACY_AVATAR_CACHE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(LEGACY_AVATAR_CACHE))
	_prune()
