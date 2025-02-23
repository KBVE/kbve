extends ColorRect

# Top Left Panel / Resource Panel
@onready var resource_panel : Label = $HBoxContainer/ResourcePanel/Label

# Bottom Panel
@onready var bottom_panel_screen_label : Label = $MainBG/NonInteractable/BottomScreen/Label

# Left Panel
@onready var categories_label : Label= $MainBG/LeftPanel/ScreenPanel/Label
@onready var cate_selected : String = categories[current_category]

# Center Panel
@onready var center_label_left : Label = $MainBG/CenterScreen/HBoxContainer/Left
@onready var center_label_right : Label = $MainBG/CenterScreen/HBoxContainer/Right
@onready var center_label_bottom : Label = $MainBG/CenterScreen/Label
@onready var button_1_left : Button = $MainBG/LeftButtons/VBoxContainer/Button # ]
@onready var button_2_left : Button = $MainBG/LeftButtons/VBoxContainer/Button2 # ]
@onready var button_3_left : Button = $MainBG/LeftButtons/VBoxContainer/Button3 # } Referenced to be disabled when confirming upgrade
@onready var button_3_right : Button = $MainBG/RightButtons/VBoxContainer/Button3 # ]
@onready var green_light : TextureRect = $MainBG/CenterScreen/GreenLight
@onready var red_light : TextureRect = $MainBG/CenterScreen/RedLight

var green_light_off : CompressedTexture2D = preload("res://assets/audioknobs-ui/audioknobs/green-light-off.png")
var green_light_on : CompressedTexture2D = preload("res://assets/audioknobs-ui/audioknobs/green-light-on.png")
var red_light_off : CompressedTexture2D = preload("res://assets/audioknobs-ui/audioknobs/red-light-off.png")
var red_light_on : CompressedTexture2D = preload("res://assets/audioknobs-ui/audioknobs/red-light-on.png")

# Left Panel
var categories : Array[StringName] = ["Weapons", "Shield", "Power", "Thrusters"]
var current_category : int = 0

# Center Panel
var current_parts := 0
var is_on_confirm := false
var chosen_upgrade
var shown_text
var weapons := [
	{"name": "+1 laser speed", "stat_name": "laser_speed", "value": 1.0, "cost": 
		{"stone": 200.0, "metal": 50.0}},
	{"name": "+1 ammo count", "stat_name": "laser_ammo", "value": 1.0, "cost": 
		{"gems": 10, "gold": 5}}
]
var shield := [
	{"name": "None", "stat_name": "none", "value": 1.0, "cost":
		{}}
]
var power := [
	{"name": "Overheat?", "stat_name": "overheat", "value": 1.0, "cost":
		{}}
]
var thrusters := [
	{"name": "+1 acceleration", "stat_name": "acceleration", "value": 1.0, "cost":
		{}},
	{"name": "+1 rotation speed", "stat_name": "rotation_speed", "value": 1.0, "cost":
		{}}
]
var chosen = [weapons, shield, power, thrusters]


func _ready():
	update_resource_panel()
	update_bottom_panel_screen()

#region LeftPanelRegion

func _on_left_button_pressed_left_panel() -> void:
	if cate_selected == categories[0]:
		pass
	else:
		current_category -= 1
	update_categories()

func _on_right_button_pressed_left_panel() -> void:
	if cate_selected == categories[3]:
		pass
	else:
		current_category += 1
	update_categories()

func update_categories() -> void:
	cate_selected = categories[current_category]
	categories_label.text = cate_selected

func _on_enter_button_pressed_left_panel() -> void:
	shown_text = chunk_array(chosen[current_category], 4)
	unshow_confirm_upgrade() # unshow when the confirm text when switching categories
	update_parts()

func update_parts() -> void:
	center_label_left.text = shown_text[current_parts][0].name + "\n" + shown_text[current_parts][1].name
	center_label_right.text = shown_text[current_parts][2].name + "\n" + shown_text[current_parts][3].name

func chunk_array(base: Array, t_size: int) -> Array:
	var result = []
	for i in range(0, base.size(), t_size):
		var chunk = base.slice(i, i + t_size)  # Get up to 'size' elements
		while chunk.size() < t_size:  # Fill missing spots with "empty"
			chunk.append({"name": "", "stat": "none", "value": 0.0})
		result.append(chunk)
	return result

#endregion

#region Center Panel

func _on_button_1_left_pressed() -> void:
	show_confirm_upgrade(0)


func _on_button_2_left_pressed() -> void:
	show_confirm_upgrade(1)


func _on_button_3_left_pressed() -> void:
	if shown_text != null:
		current_parts -= 1
		current_parts = clamp(current_parts, 0, shown_text.size() - 1)
		update_parts()


func _on_button_right_pressed() -> void:
	if is_on_confirm: # Confirm upgrade
		if can_afford():
			Global.apply_starship_bonus(chosen_upgrade.stat_name, chosen_upgrade.value)
			update_resource_panel()
			update_bottom_panel_screen()
			print("bought")
			green_light.texture = green_light_on
			await get_tree().create_timer(1.0).timeout
			green_light.texture = green_light_off
		else:
			red_light.texture = red_light_on
			await get_tree().create_timer(1.0).timeout
			red_light.texture = red_light_off            
	else:
		show_confirm_upgrade(2)

func can_afford() -> bool:
	var cost = chosen_upgrade.get("cost", {})
	for resource in cost.keys():
		if Global.resources.get(resource, 0) < cost[resource]:
			return false  # Not enough resources
	return true  # Upgrade is affordable


func _on_button_2_right_pressed() -> void:
	if is_on_confirm: # Cancel upgrade
		unshow_confirm_upgrade()
		update_parts()
	else:
		show_confirm_upgrade(3)


func _on_button_right_3_pressed() -> void:
	if shown_text != null:
		current_parts += 1
		current_parts = clamp(current_parts, 0, shown_text.size() - 1)
		update_parts()

func show_confirm_upgrade(button: int) -> void:
	if shown_text != null:
		if shown_text[current_parts][button].name != "":
			is_on_confirm = true
			chosen_upgrade = shown_text[current_parts][button]
			center_label_left.text = chosen_upgrade.name
			center_label_right.text = "Confirm" + "\n" + "Cancel"
			center_label_bottom.text = ""
			button_1_left.disabled = true
			button_2_left.disabled = true
			button_3_left.disabled = true
			button_3_right.disabled = true

func unshow_confirm_upgrade() -> void:
	is_on_confirm = false
	button_1_left.disabled = false
	button_2_left.disabled = false
	button_3_left.disabled = false
	button_3_right.disabled = false
	center_label_bottom.text = "Left Right"

#endregion

func update_resource_panel() -> void:
	var full_text = ""
	for i in Global.resources.keys():
		full_text += "%s: %d " % [i.capitalize(), Global.resources[i]]
	resource_panel.text = full_text

func update_bottom_panel_screen() -> void:
	var full_text = ""
	for i in Global.base_starship_stats.keys():
		full_text += "%s: %d " % [i.capitalize(), Global.base_starship_stats[i] + Global.starship_bonuses[i]]
	bottom_panel_screen_label.text = full_text

func _on_button_pressed_exit(): # Hides the shop on exit
		self.hide()
		get_tree().paused = false
		pass

