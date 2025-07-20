class_name ItemDatabase
extends RefCounted

# Singleton instance
static var instance: ItemDatabase

# Database storage
var items_data: Dictionary = {}
var is_loaded: bool = false

# Item database URL
const ITEMDB_URL = "https://kbve.com/api/itemdb.json"

func _init():
	if not instance:
		instance = self

static func get_instance() -> ItemDatabase:
	if not instance:
		instance = ItemDatabase.new()
	return instance

func load_items_async() -> void:
	# Try to load from local file first
	if load_from_local_file():
		return
	
	print("Local itemdb.json not found, using fallback data")
	print("Use the ItemDB Downloader plugin to download the latest data")
	load_fallback_data()

func load_from_local_file() -> bool:
	var file = FileAccess.open("res://data/itemdb.json", FileAccess.READ)
	if not file:
		return false
	
	var json_string = file.get_as_text()
	file.close()
	
	var json = JSON.new()
	var parse_result = json.parse(json_string)
	
	if parse_result != OK:
		print("Failed to parse local itemdb.json")
		return false
	
	var data = json.data
	if not data is Dictionary:
		print("Local itemdb.json is not a dictionary")
		return false
	
	items_data = data
	is_loaded = true
	print("Item database loaded from local file with ", items_data.size(), " items")
	return true

func load_fallback_data():
	# Hardcoded fallback data based on the JSON structure
	items_data = {
		"coffee": {
			"name": "Coffee",
			"type": "Drink",
			"category": "Consumable",
			"description": "A rich and aromatic coffee blend.",
			"image": "/coffee.webp",
			"bonuses": {
				"energy": 20,
				"focus": 10
			},
			"durability": 1,
			"weight": 0.2,
			"consumable": true,
			"effects": ["Energy boost", "Increased focus"],
			"price": 3,
			"cooldown": 300,
			"action": "Drink",
			"credits": 5
		},
		"tea": {
			"name": "Tea",
			"type": "Drink", 
			"category": "Consumable",
			"description": "A soothing herbal tea.",
			"image": "/tea.webp",
			"bonuses": {
				"health": 10,
				"calm": 15
			},
			"durability": 1,
			"weight": 0.1,
			"consumable": true,
			"effects": ["Health restoration", "Calming effect"],
			"price": 2,
			"cooldown": 240,
			"action": "Drink",
			"credits": 3
		},
		"bread": {
			"name": "Bread",
			"type": "Food",
			"category": "Consumable", 
			"description": "Fresh baked bread.",
			"image": "/bread.webp",
			"bonuses": {
				"health": 15,
				"hunger": 25
			},
			"durability": 3,
			"weight": 0.3,
			"consumable": true,
			"effects": ["Satisfies hunger", "Small health boost"],
			"price": 1,
			"cooldown": 180,
			"action": "Eat",
			"credits": 2
		},
		"apple": {
			"name": "Apple",
			"type": "Food",
			"category": "Consumable",
			"description": "A crisp, fresh apple.",
			"image": "/apple.webp", 
			"bonuses": {
				"health": 8,
				"hunger": 12
			},
			"durability": 1,
			"weight": 0.15,
			"consumable": true,
			"effects": ["Minor health boost", "Hunger relief"],
			"price": 1,
			"cooldown": 120,
			"action": "Eat",
			"credits": 1
		},
		"sword": {
			"name": "Iron Sword",
			"type": "Weapon",
			"category": "Equipment",
			"description": "A sturdy iron sword.",
			"image": "/sword.webp",
			"bonuses": {
				"attack": 25,
				"durability": 100
			},
			"durability": 100,
			"weight": 2.5,
			"consumable": false,
			"effects": ["Increased attack power"],
			"price": 50,
			"cooldown": 0,
			"action": "Equip",
			"credits": 25
		},
		"shield": {
			"name": "Wooden Shield", 
			"type": "Armor",
			"category": "Equipment",
			"description": "A basic wooden shield.",
			"image": "/shield.webp",
			"bonuses": {
				"defense": 15,
				"block": 20
			},
			"durability": 75,
			"weight": 1.8,
			"consumable": false,
			"effects": ["Increased defense", "Block chance"],
			"price": 30,
			"cooldown": 0,
			"action": "Equip",
			"credits": 15
		},
		"gold_coin": {
			"name": "Gold Coin",
			"type": "Currency",
			"category": "Treasure",
			"description": "A shiny gold coin.",
			"image": "/gold_coin.webp",
			"bonuses": {},
			"durability": -1,
			"weight": 0.01,
			"consumable": false,
			"effects": [],
			"price": 1,
			"cooldown": 0,
			"action": "None",
			"credits": 0
		},
		"health_potion": {
			"name": "Health Potion",
			"type": "Potion",
			"category": "Consumable",
			"description": "Restores health when consumed.",
			"image": "/health_potion.webp",
			"bonuses": {
				"health": 50
			},
			"durability": 1,
			"weight": 0.3,
			"consumable": true,
			"effects": ["Restores 50 health"],
			"price": 25,
			"cooldown": 180,
			"action": "Drink",
			"credits": 10
		},
		"mana_potion": {
			"name": "Mana Potion",
			"type": "Potion", 
			"category": "Consumable",
			"description": "Restores mana when consumed.",
			"image": "/mana_potion.webp",
			"bonuses": {
				"mana": 30
			},
			"durability": 1,
			"weight": 0.3,
			"consumable": true,
			"effects": ["Restores 30 mana"],
			"price": 20,
			"cooldown": 180,
			"action": "Drink",
			"credits": 8
		},
		"treasure_map": {
			"name": "Treasure Map",
			"type": "Document",
			"category": "Key Item",
			"description": "A mysterious map showing the location of buried treasure.",
			"image": "/treasure_map.webp",
			"bonuses": {},
			"durability": -1,
			"weight": 0.1,
			"consumable": false,
			"effects": ["Reveals treasure locations"],
			"price": 100,
			"cooldown": 0,
			"action": "Use",
			"credits": 50
		}
	}
	
	is_loaded = true
	print("Item database loaded with ", items_data.size(), " items")

func get_item_data(item_id: String) -> Dictionary:
	if not is_loaded:
		load_fallback_data()
	
	if items_data.has(item_id):
		return items_data[item_id]
	
	print("Warning: Item '", item_id, "' not found in database")
	return {}

func has_item(item_id: String) -> bool:
	if not is_loaded:
		load_fallback_data()
	return items_data.has(item_id)

func get_all_items() -> Dictionary:
	if not is_loaded:
		load_fallback_data()
	return items_data

func get_items_by_category(category: String) -> Array:
	if not is_loaded:
		load_fallback_data()
	
	var filtered_items = []
	for item_id in items_data:
		var item_data = items_data[item_id]
		if item_data.get("category", "") == category:
			filtered_items.append({
				"id": item_id,
				"data": item_data
			})
	
	return filtered_items

func get_items_by_type(type: String) -> Array:
	if not is_loaded:
		load_fallback_data()
	
	var filtered_items = []
	for item_id in items_data:
		var item_data = items_data[item_id]
		if item_data.get("type", "") == type:
			filtered_items.append({
				"id": item_id,
				"data": item_data
			})
	
	return filtered_items

func create_inventory_item(item_id: String) -> Inventory.InventoryItem:
	var item_data = get_item_data(item_id)
	if item_data.is_empty():
		return null
	
	var item = Inventory.InventoryItem.new(
		item_id,
		item_data.get("name", item_id),
		item_data.get("description", "")
	)
	
	# Map category from database to inventory enum
	var category_map = {
		"Consumable": Inventory.ItemCategory.CONSUMABLE,
		"Equipment": Inventory.ItemCategory.WEAPON,  # Will be refined based on type
		"Treasure": Inventory.ItemCategory.TREASURE,
		"Key Item": Inventory.ItemCategory.KEY_ITEM
	}
	
	var db_category = item_data.get("category", "Misc")
	item.category = category_map.get(db_category, Inventory.ItemCategory.MISC)
	
	# Refine equipment category based on type
	var item_type = item_data.get("type", "")
	if item_type == "Weapon":
		item.category = Inventory.ItemCategory.WEAPON
		item.is_equipable = true
		item.equipment_slot = Inventory.EquipmentSlot.WEAPON
	elif item_type == "Armor":
		item.category = Inventory.ItemCategory.ARMOR
		item.is_equipable = true
		item.equipment_slot = Inventory.EquipmentSlot.CHEST  # Default, could be refined
	
	# Set other properties
	item.icon_path = item_data.get("image", "")
	item.value = item_data.get("price", 0)
	
	# Set stack size based on consumable status
	if item_data.get("consumable", false):
		item.max_stack = 10  # Consumables stack
	elif item_data.get("type", "") == "Currency":
		item.max_stack = 999  # Currency stacks heavily
	else:
		item.max_stack = 1  # Equipment doesn't stack
	
	# Set stats from bonuses
	var bonuses = item_data.get("bonuses", {})
	for stat_name in bonuses:
		item.stats[stat_name] = bonuses[stat_name]
	
	return item

# Helper function to get item by name (useful for searches)
func find_item_by_name(name: String) -> String:
	if not is_loaded:
		load_fallback_data()
	
	for item_id in items_data:
		var item_data = items_data[item_id]
		if item_data.get("name", "").to_lower() == name.to_lower():
			return item_id
	
	return ""