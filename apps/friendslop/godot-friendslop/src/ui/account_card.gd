class_name AccountCard
extends VBoxContainer

## Who the player is signed in as, on the title screen.

const AVATAR_PX := 64
## Cached beside the session so a title screen opened offline still has a face on it.
const AVATAR_CACHE := "user://avatar.png"

var avatar: TextureRect
var name_label: Label
var id_label: Label
var wallet_label: Label

var _request: HTTPRequest


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
	id_label = _line(column, 11)
	wallet_label = _line(column, 13)
	id_label.modulate.a = 0.6


func _line(parent: Control, size: int) -> Label:
	var label := Label.new()
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", MenuStyle.PAPER_HOVER)
	label.add_theme_color_override("font_shadow_color", Color(0.05, 0.03, 0.02, 0.9))
	label.add_theme_constant_override("shadow_offset_x", 1)
	label.add_theme_constant_override("shadow_offset_y", 1)
	parent.add_child(label)
	return label


## The id is shown in full rather than shortened: the only reason a player reads it is to
## quote it into a bug report or a support message, and half of one is no use for that.
func show_account(username: String, user_id: String) -> void:
	visible = true
	name_label.text = username if not username.is_empty() else "signed in"
	id_label.text = user_id
	wallet_label.text = I18n.t("account.loading")


func show_wallet(credits: int, khash: int) -> void:
	wallet_label.text = I18n.t("account.wallet").format({
		"credits": _grouped(credits),
		"khash": _grouped(khash),
	})
	wallet_label.modulate = Color(1, 1, 1, 1)


## A balance that could not be read says so. Showing zero would be a number the player
## might act on, and it is a different claim from "we could not ask".
func show_wallet_error(reason: String) -> void:
	wallet_label.text = reason
	wallet_label.modulate = Color(1.0, 0.75, 0.55)


## Thousands separators, which is the difference between a credit balance being readable
## and being a wall of digits — they run to millions by design.
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


func load_avatar(url: String) -> void:
	_show_cached_avatar()
	if url.is_empty() or not url.begins_with("https://"):
		return
	if _request == null:
		_request = HTTPRequest.new()
		_request.timeout = 10.0
		add_child(_request)
		_request.request_completed.connect(_on_avatar)
	_request.request(url)


func _show_cached_avatar() -> void:
	if not FileAccess.file_exists(AVATAR_CACHE):
		return
	var image := Image.new()
	if image.load(ProjectSettings.globalize_path(AVATAR_CACHE)) == OK:
		avatar.texture = ImageTexture.create_from_image(image)


## Providers serve png or jpg and say which in the URL only sometimes, so the bytes are
## tried both ways rather than trusted. A picture that will not decode is left as whatever
## was cached, since a broken image is worse than yesterday's face.
func _on_avatar(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200 or body.is_empty():
		return
	var image := Image.new()
	if image.load_png_from_buffer(body) != OK and image.load_jpg_from_buffer(body) != OK:
		return
	avatar.texture = ImageTexture.create_from_image(image)
	image.save_png(ProjectSettings.globalize_path(AVATAR_CACHE))
