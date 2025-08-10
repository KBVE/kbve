class_name CityInterior
extends BaseInterior

# Specific implementation for city interiors

func _ready():
	structure_type = StructurePool.StructureType.CITY
	super._ready()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return "City of Prosperity"

func setup_city_actions():
	# Override base class with more detailed city actions
	fantasy_menu.add_large_button("Central Market", "market")
	fantasy_menu.add_large_button("The Gilded Tavern", "tavern") 
	fantasy_menu.add_large_button("Master Blacksmith", "blacksmith")
	fantasy_menu.add_menu_button("City Services", "services")
	fantasy_menu.add_menu_button("Guild Hall", "guild")
	fantasy_menu.add_menu_button("Bank & Treasury", "bank")

func show_market_interface():
	print("=== CENTRAL MARKET ===")
	print("Bustling with merchants from across the land!")
	print("Available goods: Weapons, Armor, Provisions, Maps")
	print("Press ESC to return")

func show_tavern_interface():
	print("=== THE GILDED TAVERN ===")
	print("The warm glow of hearth fire welcomes you.")
	print("Services: Rest, Food, Rumors, Entertainment")
	print("Press ESC to return")

func show_blacksmith_interface():
	print("=== MASTER BLACKSMITH ===")
	print("The sound of hammer on anvil echoes through the forge.")
	print("Services: Weapon Repair, Armor Crafting, Enchantments")
	print("Press ESC to return")

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"services":
			show_city_services()
		"guild":
			show_guild_hall()
		"bank":
			show_bank_interface()
		_:
			super._on_menu_action(action, data)

func show_city_services():
	print("=== CITY SERVICES ===")
	print("• Mayor's Office - City Administration")
	print("• Guard Barracks - Law and Order") 
	print("• Healer's Clinic - Medical Services")
	print("• Messenger Service - Communications")
	print("Press ESC to return")

func show_guild_hall():
	print("=== ADVENTURER'S GUILD ===")
	print("A hub for brave souls seeking fortune and glory.")
	print("Services: Quests, Contracts, Party Formation")
	print("Press ESC to return")

func show_bank_interface():
	print("=== FIRST BANK OF THE REALM ===")
	print("Secure vaults and trusted financial services.")
	print("Services: Deposits, Loans, Currency Exchange")
	print("Press ESC to return")