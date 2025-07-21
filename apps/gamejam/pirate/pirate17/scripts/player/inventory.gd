class_name Inventory
extends Node

signal item_added(item: InventoryItem, quantity: int)
signal item_removed(item: InventoryItem, quantity: int)
signal item_used(item: InventoryItem, quantity: int)
signal inventory_changed()

# Inventory configuration
const MAX_SLOTS = 20
const MAX_STACK_SIZE = 99

# Inventory storage
var items: Dictionary = {}  # item_id -> InventorySlot
var equipped_items: Dictionary = {}  # slot_type -> InventoryItem

# Item categories for organization
enum ItemCategory {
	WEAPON,
	ARMOR,
	CONSUMABLE,
	MATERIAL,
	TREASURE,
	KEY_ITEM,
	MISC
}

# Equipment slots
enum EquipmentSlot {
	WEAPON,
	HELMET,
	CHEST,
	LEGS,
	BOOTS,
	ACCESSORY
}

class InventoryItem:
	var id: String
	var name: String
	var description: String
	var category: ItemCategory
	var icon_path: String
	var value: int = 0
	var max_stack: int = 1
	var is_equipable: bool = false
	var equipment_slot: EquipmentSlot
	var stats: Dictionary = {}  # stat_name -> value
	
	func _init(item_id: String, item_name: String = "", item_desc: String = ""):
		id = item_id
		name = item_name if not item_name.is_empty() else item_id
		description = item_desc

class InventorySlot:
	var item: InventoryItem
	var quantity: int = 0
	
	func _init(inv_item: InventoryItem, qty: int = 1):
		item = inv_item
		quantity = qty
	
	func can_add(amount: int) -> bool:
		return quantity + amount <= item.max_stack
	
	func add(amount: int) -> int:
		var space_available = item.max_stack - quantity
		var amount_to_add = min(amount, space_available)
		quantity += amount_to_add
		return amount - amount_to_add  # Return overflow
	
	func remove(amount: int) -> int:
		var amount_to_remove = min(amount, quantity)
		quantity -= amount_to_remove
		return amount_to_remove

func _ready():
	# Initialize ItemDatabase (tries local file first, then fallback)
	ItemDatabase.get_instance().load_items_async()
	print("Inventory initialized with ItemDatabase")

func create_item_from_database(item_id: String) -> InventoryItem:
	return ItemDatabase.get_instance().create_inventory_item(item_id)

func create_item(id: String, name: String, description: String) -> InventoryItem:
	return InventoryItem.new(id, name, description)

func add_item_by_id(item_id: String, quantity: int = 1) -> bool:
	var item = create_item_from_database(item_id)
	if not item:
		print("Failed to create item: ", item_id)
		return false
	
	return add_item(item, quantity)

func add_item(item: InventoryItem, quantity: int = 1) -> bool:
	if quantity <= 0:
		return false
	
	var remaining_quantity = quantity
	
	# Try to add to existing stacks first
	if items.has(item.id):
		var slot = items[item.id]
		remaining_quantity = slot.add(remaining_quantity)
	
	# If there's still quantity left, create new slot
	if remaining_quantity > 0:
		if get_used_slots() >= MAX_SLOTS:
			print("Inventory full! Cannot add ", item.name)
			return false
		
		if not items.has(item.id):
			items[item.id] = InventorySlot.new(item, 0)
		
		var slot = items[item.id]
		remaining_quantity = slot.add(remaining_quantity)
	
	if remaining_quantity < quantity:
		item_added.emit(item, quantity - remaining_quantity)
		inventory_changed.emit()
		print("Added ", quantity - remaining_quantity, "x ", item.name, " to inventory")
		return true
	
	return false

func remove_item(item_id: String, quantity: int = 1) -> int:
	if not items.has(item_id):
		return 0
	
	var slot = items[item_id]
	var removed_amount = slot.remove(quantity)
	
	if slot.quantity <= 0:
		items.erase(item_id)
	
	if removed_amount > 0:
		item_removed.emit(slot.item, removed_amount)
		inventory_changed.emit()
		print("Removed ", removed_amount, "x ", slot.item.name, " from inventory")
	
	return removed_amount

func has_item(item_id: String, quantity: int = 1) -> bool:
	if not items.has(item_id):
		return false
	return items[item_id].quantity >= quantity

func get_item_quantity(item_id: String) -> int:
	if not items.has(item_id):
		return 0
	return items[item_id].quantity

func use_item(item_id: String, quantity: int = 1) -> bool:
	if not has_item(item_id, quantity):
		return false
	
	var slot = items[item_id]
	var item = slot.item
	
	# Apply item effects based on category
	match item.category:
		ItemCategory.CONSUMABLE:
			apply_consumable_effects(item, quantity)
		ItemCategory.WEAPON, ItemCategory.ARMOR:
			if item.is_equipable:
				equip_item(item)
				return true
	
	# Remove consumed items
	if item.category == ItemCategory.CONSUMABLE:
		remove_item(item_id, quantity)
	
	item_used.emit(item, quantity)
	return true

func apply_consumable_effects(item: InventoryItem, quantity: int):
	# Apply healing, buffs, etc. based on item stats
	if not Global.player or not Global.player.stats:
		return
	
	var player_stats = Global.player.stats
	
	# Apply various stat effects
	for stat_name in item.stats:
		var effect_value = item.stats[stat_name] * quantity
		
		match stat_name:
			"health", "heal":
				player_stats.heal(effect_value)
				print("Used ", item.name, " - healed for ", effect_value)
			"mana":
				player_stats.restore_mana(effect_value)
				print("Used ", item.name, " - restored ", effect_value, " mana")
			"energy":
				player_stats.restore_energy(effect_value)
				print("Used ", item.name, " - restored ", effect_value, " energy")
			"hunger":
				# Could add hunger system later
				print("Used ", item.name, " - satisfied hunger by ", effect_value)
			_:
				print("Used ", item.name, " - applied ", stat_name, " effect: ", effect_value)

func equip_item(item: InventoryItem) -> bool:
	if not item.is_equipable:
		return false
	
	var slot_type = item.equipment_slot
	
	# Unequip current item if any
	if equipped_items.has(slot_type):
		unequip_item(slot_type)
	
	# Equip new item
	equipped_items[slot_type] = item
	apply_equipment_stats(item, true)
	print("Equipped ", item.name)
	inventory_changed.emit()
	return true

func unequip_item(slot_type: EquipmentSlot) -> bool:
	if not equipped_items.has(slot_type):
		return false
	
	var item = equipped_items[slot_type]
	equipped_items.erase(slot_type)
	apply_equipment_stats(item, false)
	print("Unequipped ", item.name)
	inventory_changed.emit()
	return true

func apply_equipment_stats(item: InventoryItem, is_equipping: bool):
	# Apply or remove stat bonuses from equipment
	if not Global.player or not Global.player.stats:
		return
	
	var multiplier = 1 if is_equipping else -1
	
	for stat_name in item.stats:
		var value = item.stats[stat_name] * multiplier
		
		match stat_name:
			"attack":
				Global.player.stats.base_attack += value
			"defense":
				Global.player.stats.base_defense += value
			"max_health":
				Global.player.stats.max_health += value
			"max_mana":
				Global.player.stats.max_mana += value

func get_used_slots() -> int:
	return items.size()

func get_available_slots() -> int:
	return MAX_SLOTS - get_used_slots()

func get_all_items() -> Array[InventorySlot]:
	var item_list: Array[InventorySlot] = []
	for slot in items.values():
		item_list.append(slot)
	return item_list

func get_items_by_category(category: ItemCategory) -> Array[InventorySlot]:
	var filtered_items: Array[InventorySlot] = []
	for slot in items.values():
		if slot.item.category == category:
			filtered_items.append(slot)
	return filtered_items

func get_total_value() -> int:
	var total = 0
	for slot in items.values():
		total += slot.item.value * slot.quantity
	return total

func is_equipped(item_id: String) -> bool:
	for equipped_item in equipped_items.values():
		if equipped_item.id == item_id:
			return true
	return false

func get_equipped_item(slot_type: EquipmentSlot) -> InventoryItem:
	return equipped_items.get(slot_type, null)

# Debug and utility functions
func print_inventory():
	print("=== INVENTORY ===")
	print("Used slots: ", get_used_slots(), "/", MAX_SLOTS)
	print("Total value: ", get_total_value(), " gold")
	
	for slot in items.values():
		var equipped_text = " [EQUIPPED]" if is_equipped(slot.item.id) else ""
		print("- ", slot.quantity, "x ", slot.item.name, equipped_text)
	
	print("=== EQUIPPED ===")
	for slot_type in equipped_items:
		var item = equipped_items[slot_type]
		print("- ", EquipmentSlot.keys()[slot_type], ": ", item.name)

# Save/Load functions for persistence
func get_save_data() -> Dictionary:
	var save_data = {
		"items": {},
		"equipped_items": {}
	}
	
	for item_id in items:
		var slot = items[item_id]
		save_data.items[item_id] = {
			"quantity": slot.quantity
		}
	
	for slot_type in equipped_items:
		save_data.equipped_items[slot_type] = equipped_items[slot_type].id
	
	return save_data

func load_save_data(save_data: Dictionary):
	items.clear()
	equipped_items.clear()
	
	# Load items (would need item registry in real implementation)
	if save_data.has("items"):
		for item_id in save_data.items:
			var item_data = save_data.items[item_id]
			# Would need to recreate items from registry
			print("Loading item: ", item_id, " qty: ", item_data.quantity)
	
	inventory_changed.emit()