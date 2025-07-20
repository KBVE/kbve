extends Node

const ULID = preload("res://scripts/utils/ulid.gd")

var player_ulid: String = ""
var player_name: String = ""

func _ready():
	if player_ulid.is_empty():
		player_ulid = ULID.generate()
	
	if player_name.is_empty():
		player_name = "Captain Anon" + str(randi_range(1000, 9999))