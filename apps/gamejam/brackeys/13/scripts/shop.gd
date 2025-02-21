extends ColorRect

@onready var categories_label := $MainBG/LeftPanel/ScreenPanel/Label

var categories : Array[StringName]= ["Weapons", "Shield", "Power", "Thrusters"]
var n = 0
@onready var cate_selected:= categories[n]


# Called when the node enters the scene tree for the first time.
func _ready():

	pass # Replace with function body.


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta):
	pass


#region LeftPanelRegion

func _on_left_button_pressed_left_panel() -> void:
	if cate_selected == categories[0]:
		pass
	else:
		n -= 1
	update_categories()

func _on_right_button_pressed_left_panel() -> void:
	if cate_selected == categories[3]:
		pass
	else:
		n += 1
	update_categories()

func _on_enter_button_pressed_left_panel() -> void:
	pass

func update_categories() -> void:
	cate_selected = categories[n]
	categories_label.text = cate_selected

#endregion