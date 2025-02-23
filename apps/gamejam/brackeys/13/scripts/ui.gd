# v2 - UI Manager.
extends Node

const SHOP_SCENE = preload("res://scenes/shop/shop.tscn")
var shop_instance: Node

const INTERACTIONS_UI = preload("res://scenes/ui/interactions.tscn")
var interactions: CanvasLayer

const NPC_UI = preload("res://scenes/npc/npc.tscn")
var npc: CanvasLayer

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
