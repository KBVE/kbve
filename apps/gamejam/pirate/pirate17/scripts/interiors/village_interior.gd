class_name VillageInterior
extends BaseInterior

# Specific implementation for village interiors

func _ready():
	structure_type = StructurePool.StructureType.VILLAGE
	super._ready()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return "Village Commons"

func setup_village_actions():
	# Override base class with village-specific actions
	fantasy_menu.add_large_button("Village Shop", "shop")
	fantasy_menu.add_large_button("The Cozy Inn", "inn")
	fantasy_menu.add_menu_button("Talk to Elder", "elder")
	fantasy_menu.add_menu_button("Visit Villagers", "talk")
	fantasy_menu.add_menu_button("Village Well", "well")

func show_shop_interface():
	print("=== VILLAGE SHOP ===")
	print("A modest shop with essential supplies.")
	print("Available: Basic provisions, simple tools, local crafts")
	print("The shopkeeper greets you with a warm smile.")
	print("Press ESC to return")

func show_inn_interface():
	print("=== THE COZY INN ===")
	print("A small but comfortable inn run by a friendly family.")
	print("Services: Rest (5 gold), Simple meals (2 gold)")
	print("The common room is filled with local chatter.")
	print("Press ESC to return")

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"elder":
			talk_to_elder()
		"well":
			visit_village_well()
		"talk":
			talk_to_villagers()
		_:
			super._on_menu_action(action, data)

func talk_to_elder():
	print("=== VILLAGE ELDER ===")
	print("A wise old person approaches you with kind eyes.")
	print("'Welcome, traveler. Our village may be small, but our hearts are big.'")
	print("The elder shares local wisdom and village history.")
	print("Press ESC to return")

func visit_village_well():
	print("=== VILLAGE WELL ===")
	print("The central gathering place of the village.")
	print("Crystal clear water reflects the sky above.")
	print("You notice villagers drawing water and sharing news.")
	print("Press ESC to return")

func talk_to_villagers():
	var villager_messages = [
		"'The harvest this year has been bountiful!'",
		"'Strange lights were seen over the old ruins last night.'",
		"'The merchant caravan should arrive next week.'",
		"'My grandmother makes the best apple pies in the region!'",
		"'Have you heard about the treasure in the ancient tower?'"
	]
	
	print("=== VILLAGE GOSSIP ===")
	print("You mingle with the friendly villagers.")
	for i in range(3):
		var random_message = villager_messages[randi() % villager_messages.size()]
		print("Villager: ", random_message)
	print("Press ESC to return")