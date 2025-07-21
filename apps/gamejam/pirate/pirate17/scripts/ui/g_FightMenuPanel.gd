extends Node

@onready var output_log := get_node("/root/Battle/CanvasLayer/TextView/RichTextLabel")

func _ready():
    $MenuButton1.pressed.connect(_on_MenuButton1_pressed)
    $MenuButton2.pressed.connect(_on_MenuButton2_pressed)
    $MenuButton3.pressed.connect(_on_MenuButton3_pressed)
    $MenuButton4.pressed.connect(_on_MenuButton4_pressed)
    #$MenuContainer/MenuButton1.pressed.connect(_on_MenuButton1_pressed)
    #$MenuContainer/MenuButton2.pressed.connect(_on_MenuButton2_pressed)

func print_to_log(text: String) -> void:
    output_log.append_text(text + "\n")
    await get_tree().process_frame  # wait 1 frame
    output_log.get_v_scroll_bar().value = output_log.get_v_scroll_bar().max_value
    
func _on_MenuButton1_pressed():
    print("Menu Button 1 clicked")
    print_to_log("Menu Button 1 clicked")

func _on_MenuButton2_pressed():
    print("Menu Button 2 clicked")
    print_to_log("Menu Button 2 clicked")
    
func _on_MenuButton3_pressed():
    print("Menu Button 3 clicked")
    print_to_log("Menu Button 3 clicked")
    
func _on_MenuButton4_pressed():
    print("Menu Button 4 clicked")
    print_to_log("Menu Button 4 clicked")
