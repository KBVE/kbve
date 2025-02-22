extends ColorRect

# Left Panel
@onready var categories_label := $MainBG/LeftPanel/ScreenPanel/Label
@onready var cate_selected:= categories[current_category]

# Center Panel
@onready var center_label_left := $MainBG/CenterScreen/HBoxContainer/Left
@onready var center_label_right := $MainBG/CenterScreen/HBoxContainer/Right
@onready var shown_text = chunk_array(chosen[current_category], 4)

# Left Panel
var categories : Array[StringName]= ["Weapons", "Shield", "Power", "Thrusters"]
var current_category = 0

# Center Panel
var current_parts = 0
var weapons := [
	"+1 damage",
	"+1 max ammo",
	"+1 laser speed",
	"+111 test",
	"+12 test",
	"+13 test",
	"+123 test",
	"+1244 test",
	"+14 test",
]
var shield := []
var power := []
var thrusters := []
var chosen = [weapons, shield, power, thrusters]


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
	update_parts()

func update_parts() -> void:
	center_label_left.text = shown_text[current_parts][0] + "\n" + shown_text[current_parts][1]
	center_label_right.text = shown_text[current_parts][2] + "\n" + shown_text[current_parts][3]

func chunk_array(base: Array, size: int) -> Array:
	var result = []
	for i in range(0, base.size(), size):
		var chunk = base.slice(i, i + size)  # Get up to 'size' elements
		while chunk.size() < size:  # Fill missing spots with "empty"
			chunk.append("")
		result.append(chunk)
	return result

#endregion

#region Center Panel

func _on_button_1_left_pressed():
	pass # Replace with function body.


func _on_button_2_left_pressed():
	pass # Replace with function body.


func _on_button_3_left_pressed():
	current_parts -= 1
	current_parts = clamp(current_parts, 0, 5)
	update_parts()


func _on_button_right_pressed():
	pass # Replace with function body.


func _on_button_2_right_pressed():
	pass # Replace with function body.


func _on_button_right_3_pressed():
	current_parts += 1
	current_parts = clamp(current_parts, 0, shown_text.size() - 1)
	update_parts()

#endregion
