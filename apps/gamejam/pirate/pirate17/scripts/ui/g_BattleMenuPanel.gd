extends Node

@onready var output_log := get_node("/root/Battle/CanvasLayer/TextView/RichTextLabel")
@onready var fightMenuPanel := get_node("/root/Battle/CanvasLayer/FightMenuPanel")
@onready var crewMenuPanel := get_node("/root/Battle/CanvasLayer/CrewMenuPanel")
@onready var itemMenuPanel := get_node("/root/Battle/CanvasLayer/ItemMenuPanel")

func _ready():
    $FightButton.pressed.connect(_on_FightButton_pressed)
    $CrewButton.pressed.connect(_on_CrewButton_pressed)
    $ItemButton.pressed.connect(_on_ItemButton_pressed)
    $RunButton.pressed.connect(_on_RunButton_pressed)

func print_to_log(text: String) -> void:
    output_log.append_text(text + "\n")
    await get_tree().process_frame  # wait 1 frame
    output_log.get_v_scroll_bar().value = output_log.get_v_scroll_bar().max_value
    
func _on_FightButton_pressed():
    print("Fight Button clicked")
    print_to_log("Fight Button clicked")
    fightMenuPanel.visible = not fightMenuPanel.visible
    crewMenuPanel.visible = false
    itemMenuPanel.visible = false

func _on_CrewButton_pressed():
    print("Crew Button clicked")
    print_to_log("Crew Button clicked")
    fightMenuPanel.visible = false
    crewMenuPanel.visible = not crewMenuPanel.visible
    itemMenuPanel.visible = false
    
func _on_ItemButton_pressed():
    print("Item Button clicked")
    print_to_log("Item Button clicked")
    fightMenuPanel.visible = false
    crewMenuPanel.visible = false
    itemMenuPanel.visible = not itemMenuPanel.visible
    
func _on_RunButton_pressed():
    print("Run Button clicked")
    print_to_log("Run Button clicked")
