# v2 - UI Manager.
extends Node

const SHOP_SCENE = preload("res://scenes/shop/shop.tscn")
var shop_instance: Node
# var shop_ui: Control
const INTERACTIONS_UI = preload("res://scenes/ui/interactions.tscn")
var interactions: Control

# const UI_SCENE = preload("res://scenes/ui/ui.tscn")
# var ui_instance: Node
# var interaction_prompt: Control

const NPC_UI = preload("res://scenes/npc/npc.tscn")
var npc: Control

func _ready():
    shop_instance = SHOP_SCENE.instantiate()
    add_child(shop_instance)
    shop_instance.visible = false

    interactions = INTERACTIONS_UI.instantiate()
    add_child(interactions)
    interactions.visible = false

    npc = NPC_UI.instantiate()
    add_child(npc)
    npc.visible = false

    pass;
