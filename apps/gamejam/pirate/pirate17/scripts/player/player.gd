extends Node

const ULID = preload("res://scripts/utils/ulid.gd")

var player_ulid: String = ""
var player_name: String = ""
var stats: Stats
var inventory: Inventory

func _ready():
	if player_ulid.is_empty():
		player_ulid = ULID.generate()
	
	if player_name.is_empty():
		player_name = "Captain Anon" + str(randi_range(1000, 9999))
	
	stats = Stats.new()
	inventory = Inventory.new()
	add_child(inventory)
	
	# Give player some starting items
	give_starting_items()

func give_starting_items():
	# Add starting items using the ItemDatabase
	inventory.add_item_by_id("gold_coin", 25)
	inventory.add_item_by_id("health_potion", 5) 
	inventory.add_item_by_id("mana_potion", 3)
	inventory.add_item_by_id("bread", 10)
	inventory.add_item_by_id("apple", 8)
	inventory.add_item_by_id("treasure_map", 1)
	
	print("Player received starting items from ItemDatabase!")
	inventory.print_inventory()