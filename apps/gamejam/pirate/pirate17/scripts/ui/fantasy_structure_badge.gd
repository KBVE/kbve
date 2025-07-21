class_name FantasyStructureBadge
extends Control

@export var badge_texture_path: String = "res://assets/ui/fantasy/HotkeyBox_34x34.png"
@export var structure_name: String = "" : set = set_structure_name
@export var structure_type: String = "" : set = set_structure_type

var background_panel: NinePatchRect
var name_label: Label
var type_label: Label

# Structure type colors for badges
var structure_colors = {
	"CITY": Color(1.0, 0.8, 0.0, 1.0),      # Gold
	"CASTLE": Color(0.4, 0.4, 0.4, 1.0),    # Dark Gray
	"VILLAGE": Color(0.6, 0.4, 0.2, 1.0),   # Brown
	"TOWER": Color(0.5, 0.2, 0.8, 1.0),     # Purple
	"RUINS": Color(0.4, 0.4, 0.4, 1.0),     # Dim Gray
	"TEMPLE": Color(0.9, 0.9, 0.9, 1.0),    # White
	"FORTRESS": Color(0.8, 0.2, 0.2, 1.0),  # Red
	"PORT": Color(0.2, 0.8, 0.8, 1.0),      # Cyan
}

func _ready():
	setup_background()
	setup_labels()
	
	# Set compact size for structure badges
	custom_minimum_size = Vector2(80, 40)
	size = Vector2(80, 40)
	
	# Resize to fit content after setup
	if structure_name != "":
		resize_to_fit_content()

func setup_background():
	background_panel = NinePatchRect.new()
	background_panel.texture = load(badge_texture_path)
	
	# Don't use anchors preset - set size manually
	background_panel.position = Vector2.ZERO
	background_panel.size = size
	
	# Set nine-patch margins for proper stretching
	background_panel.patch_margin_left = 6
	background_panel.patch_margin_right = 6
	background_panel.patch_margin_top = 6
	background_panel.patch_margin_bottom = 6
	
	add_child(background_panel)

func setup_labels():
	# Structure name label (main text)
	name_label = Label.new()
	name_label.text = structure_name
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.add_theme_font_size_override("font_size", 9)
	name_label.add_theme_color_override("font_color", Color.WHITE)
	name_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	name_label.add_theme_constant_override("shadow_offset_x", 1)
	name_label.add_theme_constant_override("shadow_offset_y", 1)
	
	# Position and size manually
	name_label.position = Vector2(4, 4)
	name_label.size = Vector2(size.x - 8, 20)
	
	background_panel.add_child(name_label)
	
	# Structure type label (smaller, below name)
	type_label = Label.new()
	type_label.text = structure_type
	type_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	type_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	type_label.add_theme_font_size_override("font_size", 7)
	type_label.add_theme_color_override("font_color", Color.LIGHT_GRAY)
	type_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	type_label.add_theme_constant_override("shadow_offset_x", 1)
	type_label.add_theme_constant_override("shadow_offset_y", 1)
	
	# Position below name label
	type_label.position = Vector2(4, 20)
	type_label.size = Vector2(size.x - 8, 16)
	
	background_panel.add_child(type_label)

func set_structure_name(new_name: String):
	structure_name = new_name
	if name_label:
		name_label.text = structure_name
		resize_to_fit_content()

func set_structure_type(new_type: String):
	structure_type = new_type
	if type_label:
		type_label.text = structure_type
		update_type_color()
		resize_to_fit_content()

func update_type_color():
	if type_label and structure_colors.has(structure_type):
		type_label.add_theme_color_override("font_color", structure_colors[structure_type])

func resize_to_fit_content():
	if not name_label:
		return
	
	# Get the text dimensions for both labels
	var font = name_label.get_theme_font("font")
	var name_font_size = name_label.get_theme_font_size("font_size")
	var type_font_size = type_label.get_theme_font_size("font_size") if type_label else 7
	
	# Use default font if theme font is not available
	if not font:
		font = ThemeDB.fallback_font
	if name_font_size <= 0:
		name_font_size = 9
	if type_font_size <= 0:
		type_font_size = 7
	
	# Calculate text sizes with padding
	var name_size = font.get_string_size(structure_name, HORIZONTAL_ALIGNMENT_LEFT, -1, name_font_size)
	var type_size = font.get_string_size(structure_type, HORIZONTAL_ALIGNMENT_LEFT, -1, type_font_size)
	
	# Determine required width (use the larger of the two texts)
	var required_width = max(name_size.x, type_size.x) + 16  # 8px padding on each side
	var required_height = 40  # Fixed height for consistency
	
	# Set minimum and maximum size constraints
	var new_width = max(min(required_width, 120), 60)  # Between 60 and 120 pixels wide
	var new_size = Vector2(new_width, required_height)
	
	custom_minimum_size = new_size
	size = new_size
	
	# Update background panel size
	if background_panel:
		background_panel.size = new_size
	
	# Update label sizes
	if name_label:
		name_label.size = Vector2(new_size.x - 8, 20)
	if type_label:
		type_label.size = Vector2(new_size.x - 8, 16)

func update_structure_info(name: String, type: String):
	set_structure_name(name)
	set_structure_type(type)

# Convenience function to create and position above a structure
static func create_for_structure(structure, offset: Vector2 = Vector2(-40, -50)) -> FantasyStructureBadge:
	var badge = FantasyStructureBadge.new()
	badge.structure_name = structure.name
	badge.structure_type = structure.type
	badge.position = offset
	badge.z_index = 30  # Above everything else
	return badge

# Alternative textures for different structure types
func set_badge_texture_by_type(structure_type_enum):
	match structure_type_enum:
		0, 1, 6:  # CITY, CASTLE, FORTRESS - Use decorative panels
			badge_texture_path = "res://assets/ui/fantasy/TopPatternPanel_01_33x15.png"
			custom_minimum_size.y = 20
			size.y = 20
		2, 3:  # VILLAGE, TOWER - Use standard boxes
			badge_texture_path = "res://assets/ui/fantasy/HotkeyBox_34x34.png"
		4, 5:  # RUINS, TEMPLE - Use character boxes for mystique
			badge_texture_path = "res://assets/ui/fantasy/MenusBox_34x34.png"
		7:  # PORT - Use title box for wide format
			badge_texture_path = "res://assets/ui/fantasy/TitleBox_64x16.png"
			custom_minimum_size.y = 20
			size.y = 20
		_:
			badge_texture_path = "res://assets/ui/fantasy/HotkeyBox_34x34.png"
	
	# Reload the texture if background panel exists
	if background_panel:
		background_panel.texture = load(badge_texture_path)