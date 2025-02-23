# v2 - UI Manager.
extends Node

const INTERACTIONS_UI = preload("res://scenes/ui/interactions.tscn")
var interactions: CanvasLayer

const NPC_UI = preload("res://scenes/npc/npc.tscn")
var npc: CanvasLayer

func _ready():
	interactions = INTERACTIONS_UI.instantiate()
	add_child(interactions)
	interactions.visible = false

	npc = NPC_UI.instantiate()
	add_child(npc)
	npc.visible = false

	pass;

func show_npc(image: Texture, name: String, text: String):
	if npc:
		npc.set_npc_data(image, name, text)
		npc.visible = true 

func hide_npc():
	if npc:
		npc.hide_npc()
