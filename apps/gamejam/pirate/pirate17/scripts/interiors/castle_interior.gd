class_name CastleInterior
extends BaseInterior

# Specific implementation for castle interiors

func _ready():
	structure_type = StructurePool.StructureType.CASTLE
	super._ready()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return "Royal Castle"

func populate_menu_actions():
	# Castle-specific actions
	fantasy_menu.add_large_button("Throne Room", "throne")
	fantasy_menu.add_large_button("Royal Court", "court")
	fantasy_menu.add_large_button("Armory", "armory")
	fantasy_menu.add_menu_button("Treasury", "treasury")
	fantasy_menu.add_menu_button("Royal Guard", "guard")
	fantasy_menu.add_menu_button("Library", "library")
	
	# Always add exit option
	fantasy_menu.add_menu_button(exit_button_text, "exit")

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"throne":
			visit_throne_room()
		"court":
			visit_royal_court()
		"armory":
			visit_royal_armory()
		"treasury":
			visit_royal_treasury()
		"guard":
			speak_with_royal_guard()
		"library":
			visit_castle_library()
		_:
			super._on_menu_action(action, data)

func visit_throne_room():
	print("=== ROYAL THRONE ROOM ===")
	print("A magnificent hall with towering pillars and stained glass.")
	print("The ornate throne sits empty, awaiting royal presence.")
	print("Tapestries depicting great battles adorn the walls.")
	print("You feel the weight of history in this sacred space.")
	print("Press ESC to return")

func visit_royal_court():
	print("=== ROYAL COURT ===")
	print("Nobles in fine attire discuss matters of the realm.")
	print("'Ah, a visitor!' notes a courtier in velvet robes.")
	print("Court Affairs:")
	print("• Land Disputes")
	print("• Trade Agreements") 
	print("• Noble Marriages")
	print("• Military Campaigns")
	print("Press ESC to return")

func visit_royal_armory():
	print("=== ROYAL ARMORY ===")
	print("Gleaming weapons and pristine armor fill the chamber.")
	print("The master-at-arms maintains the finest equipment.")
	print("'These weapons have protected the realm for generations.'")
	print("Available Equipment:")
	print("• Royal Sword - Masterwork Quality")
	print("• Knight's Armor - Superior Protection")
	print("• Enchanted Shield - Magical Defense")
	print("Press ESC to return")

func visit_royal_treasury():
	print("=== ROYAL TREASURY ===")
	print("Heavy doors lead to vaults filled with the realm's wealth.")
	print("'Only authorized personnel may enter,' warns the guard.")
	print("You glimpse gold coins, jewels, and precious artifacts.")
	print("The treasury funds the castle's operations and defense.")
	print("Press ESC to return")

func speak_with_royal_guard():
	print("=== ROYAL GUARD ===")
	print("Elite soldiers in polished armor stand at attention.")
	print("'The realm's security is our sacred duty.'")
	print("Guard Captain: 'We've had reports of bandits on the roads.'")
	print("Guard: 'The castle's defenses are impregnable.'")
	print("Guard: 'His Majesty values loyalty above all else.'")
	print("Press ESC to return")

func visit_castle_library():
	print("=== ROYAL LIBRARY ===")
	print("Ancient tomes and scrolls contain the realm's knowledge.")
	print("A scholarly scribe tends to the precious manuscripts.")
	print("'Knowledge is the greatest treasure,' he whispers.")
	print("Available Texts:")
	print("• Royal Chronicles - History of the Realm")
	print("• Military Tactics - Strategic Warfare")
	print("• Arcane Studies - Magical Knowledge")
	print("Press ESC to return")