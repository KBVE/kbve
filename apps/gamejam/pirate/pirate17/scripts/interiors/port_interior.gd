class_name PortInterior
extends BaseInterior

# Specific implementation for port interiors

func _ready():
	structure_type = StructurePool.StructureType.PORT
	super._ready()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return "Harbor District"

func setup_port_actions():
	# Override base class with port-specific actions
	fantasy_menu.add_large_button("Harbor Master", "harbor")
	fantasy_menu.add_large_button("Ship Services", "ships")
	fantasy_menu.add_large_button("Trading Post", "trade")
	fantasy_menu.add_menu_button("Sailor's Tavern", "tavern")
	fantasy_menu.add_menu_button("Customs Office", "customs")
	fantasy_menu.add_menu_button("Dock Workers", "dock")

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"harbor":
			visit_harbor_master()
		"ships":
			show_ship_services()
		"trade":
			show_trading_post()
		"customs":
			visit_customs_office()
		"dock":
			talk_to_dock_workers()
		_:
			super._on_menu_action(action, data)

func visit_harbor_master():
	print("=== HARBOR MASTER'S OFFICE ===")
	print("A weathered sea captain greets you behind a cluttered desk.")
	print("'Ahoy there! Looking for passage or harbor information?'")
	print("Services: Ship Registration, Harbor Fees, Navigation Charts")
	print("'The seas have been rough lately, be careful out there.'")
	print("Press ESC to return")

func show_ship_services():
	print("=== SHIP SERVICES DOCK ===")
	print("Skilled craftsmen work on various vessels.")
	print("The sound of hammering and sawing fills the air.")
	print("Services:")
	print("• Hull Repairs - 50 gold")
	print("• Sail Maintenance - 25 gold") 
	print("• Cannon Servicing - 75 gold")
	print("• Supply Provisioning - 30 gold")
	print("Press ESC to return")

func show_trading_post():
	print("=== MARITIME TRADING POST ===")
	print("Exotic goods from distant lands line the shelves.")
	print("The merchant's eyes gleam with opportunity.")
	print("Available Trade Goods:")
	print("• Rare Spices - High Value")
	print("• Silk Fabrics - Luxury Item")
	print("• Navigation Instruments - Essential")
	print("• Foreign Coins - Currency Exchange")
	print("Press ESC to return")

func show_tavern_interface():
	print("=== THE SALTY ANCHOR TAVERN ===")
	print("Rowdy sailors share tales of adventure over ale.")
	print("The air is thick with pipe smoke and sea shanties.")
	print("Services: Drinks, Meals, Sailor's Stories, Ship Crew Hiring")
	print("'Care to hear about the ghost ship seen last week?'")
	print("Press ESC to return")

func visit_customs_office():
	print("=== PORT CUSTOMS OFFICE ===")
	print("An official in crisp uniform reviews manifests.")
	print("'All cargo must be declared and inspected.'")
	print("Services:")
	print("• Import/Export Documentation")
	print("• Tax Collection")
	print("• Contraband Inspection")
	print("• Trading Licenses")
	print("Press ESC to return")

func talk_to_dock_workers():
	print("=== DOCK WORKERS ===")
	print("Hardworking sailors pause from loading cargo.")
	print("'Another day, another shipment!' one calls out.")
	print("Dock Worker: 'That merchant vessel brought strange cargo today.'")
	print("Dock Worker: 'Been seeing more pirates in these waters lately.'")
	print("Dock Worker: 'The tide will turn high around sunset.'")
	print("Press ESC to return")