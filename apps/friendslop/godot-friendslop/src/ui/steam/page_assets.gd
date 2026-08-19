extends Node

const OUT_DIR := "res://screenshots/steam"
const LOGO_PATH := "res://assets/ui/steam_logo.png"
const TITLE_FONT_PATH := "res://assets/fonts/Alagard.ttf"
const MAX_SUPERSAMPLE_WIDTH := 4096

const SPECS := [
	{"name": "header_capsule", "size": Vector2i(920, 430), "logo": true},
	{"name": "small_capsule", "size": Vector2i(462, 174), "logo": true},
	{"name": "main_capsule", "size": Vector2i(1232, 706), "logo": true},
	{"name": "vertical_capsule", "size": Vector2i(748, 896), "logo": true},
	{"name": "library_capsule", "size": Vector2i(600, 900), "logo": true},
	{"name": "library_header", "size": Vector2i(920, 430), "logo": true},
	{"name": "library_hero", "size": Vector2i(3840, 1240), "logo": false},
	{"name": "page_background", "size": Vector2i(1438, 810), "logo": false},
	{"name": "event_cover", "size": Vector2i(800, 450), "logo": false},
	{"name": "event_header", "size": Vector2i(1920, 622), "logo": false},
	{"name": "screenshot_1080", "size": Vector2i(1920, 1080), "logo": false},
	{"name": "icon_512", "size": Vector2i(512, 512), "logo": false},
	{"name": "app_icon_184", "size": Vector2i(184, 184), "logo": false},
]

@export var game_title := "Friendslop"
@export var title_font_size := 160
@export var title_color := Color(0.96, 0.91, 0.78)
@export var title_outline_color := Color(0.13, 0.08, 0.06)
@export var cam_position := Vector3(6.0, 3.0, 26.0)
@export var cam_look_at := Vector3(0.0, 0.5, 14.0)
@export var cam_fov := 55.0
@export var warmup_frames := 60
@export var settle_frames := 6

var shot_overrides := {
	"vertical_capsule": {"fov": 65.0},
	"library_capsule": {"fov": 65.0},
	"icon_512": {"fov": 40.0},
	"app_icon_184": {"fov": 40.0},
}

func _ready() -> void:
	get_window().unfocusable = true
	var scene: Node = load("res://scenes/main.tscn").instantiate()
	add_child(scene)
	for i in warmup_frames:
		await get_tree().process_frame
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUT_DIR))
	var logo: Image = await _load_logo()
	for spec in SPECS:
		var img := await _render_shot(spec)
		if spec.logo and logo:
			_overlay_logo(img, logo)
		var path := "%s/%s.png" % [OUT_DIR, spec.name]
		img.save_png(path)
		print("saved ", path, " ", img.get_size())
	if logo:
		_export_library_logo(logo)
	get_tree().quit()

func _render_shot(spec: Dictionary) -> Image:
	var size: Vector2i = spec.size
	var ss := 2 if size.x * 2 <= MAX_SUPERSAMPLE_WIDTH else 1
	var vp := SubViewport.new()
	vp.size = size * ss
	vp.world_3d = get_viewport().world_3d
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.msaa_3d = Viewport.MSAA_4X
	add_child(vp)
	var cam := Camera3D.new()
	vp.add_child(cam)
	var ov: Dictionary = shot_overrides.get(spec.name, {})
	cam.fov = ov.get("fov", cam_fov)
	cam.global_position = ov.get("position", cam_position)
	cam.look_at(ov.get("look_at", cam_look_at), Vector3.UP)
	cam.current = true
	for i in settle_frames:
		await get_tree().process_frame
	var img := vp.get_texture().get_image()
	vp.queue_free()
	if ss > 1:
		img.resize(size.x, size.y, Image.INTERPOLATE_LANCZOS)
	return img

func _load_logo() -> Image:
	if ResourceLoader.exists(LOGO_PATH):
		var tex: Texture2D = load(LOGO_PATH)
		return tex.get_image()
	if ResourceLoader.exists(TITLE_FONT_PATH):
		print("no logo at ", LOGO_PATH, " — rendering title with Alagard")
		return await _render_title_logo()
	print("no logo and no title font — capsules exported without title art")
	return null

func _render_title_logo() -> Image:
	var vp := SubViewport.new()
	vp.size = Vector2i(2560, 720)
	vp.transparent_bg = true
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(vp)
	var label := Label.new()
	label.text = game_title
	label.add_theme_font_override("font", load(TITLE_FONT_PATH))
	label.add_theme_font_size_override("font_size", title_font_size)
	label.add_theme_color_override("font_color", title_color)
	label.add_theme_color_override("font_outline_color", title_outline_color)
	label.add_theme_constant_override("outline_size", int(title_font_size / 12.0))
	label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.55))
	label.add_theme_constant_override("shadow_offset_x", int(title_font_size / 20.0))
	label.add_theme_constant_override("shadow_offset_y", int(title_font_size / 20.0))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	vp.add_child(label)
	for i in settle_frames:
		await get_tree().process_frame
	var img := vp.get_texture().get_image()
	vp.queue_free()
	if img.get_format() != Image.FORMAT_RGBA8:
		img.convert(Image.FORMAT_RGBA8)
	var used := img.get_used_rect()
	if used.size.x > 0 and used.size.y > 0:
		img = img.get_region(used.grow(8).intersection(Rect2i(Vector2i.ZERO, img.get_size())))
	return img

func _overlay_logo(img: Image, logo: Image) -> void:
	var target_w := int(img.get_width() * 0.72)
	var scale := float(target_w) / float(logo.get_width())
	var target_h := int(logo.get_height() * scale)
	var scaled := logo.duplicate() as Image
	scaled.resize(target_w, target_h, Image.INTERPOLATE_LANCZOS)
	if scaled.get_format() != Image.FORMAT_RGBA8:
		scaled.convert(Image.FORMAT_RGBA8)
	if img.get_format() != Image.FORMAT_RGBA8:
		img.convert(Image.FORMAT_RGBA8)
	var pos := Vector2i((img.get_width() - target_w) / 2, img.get_height() - target_h - int(img.get_height() * 0.08))
	img.blend_rect(scaled, Rect2i(Vector2i.ZERO, scaled.get_size()), pos)

func _export_library_logo(logo: Image) -> void:
	var out := logo.duplicate() as Image
	if out.get_format() != Image.FORMAT_RGBA8:
		out.convert(Image.FORMAT_RGBA8)
	var s: float = min(1280.0 / out.get_width(), 720.0 / out.get_height())
	if s < 1.0:
		out.resize(int(out.get_width() * s), int(out.get_height() * s), Image.INTERPOLATE_LANCZOS)
	var path := "%s/library_logo.png" % OUT_DIR
	out.save_png(path)
	print("saved ", path, " ", out.get_size())
