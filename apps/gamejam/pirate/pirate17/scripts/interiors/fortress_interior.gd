class_name FortressInterior
extends BaseInterior

# Specific implementation for fortress interiors
# Note: Fortresses are typically non-enterable, but this handles special cases

func _ready():
	structure_type = StructurePool.StructureType.FORTRESS
	super._ready()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return "Military Fortress"

func populate_menu_actions():
	# Fortress-specific actions (limited access)
	fantasy_menu.add_large_button("Speak to Commander", "commander")
	fantasy_menu.add_large_button("Visit Barracks", "barracks")
	fantasy_menu.add_menu_button("Training Grounds", "training")
	fantasy_menu.add_menu_button("Supply Depot", "supplies")
	fantasy_menu.add_menu_button("Gate Guard", "guard")
	
	# Always add exit option
	fantasy_menu.add_menu_button(exit_button_text, "exit")

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"commander":
			speak_to_commander()
		"barracks":
			visit_barracks()
		"training":
			observe_training_grounds()
		"supplies":
			visit_supply_depot()
		"guard":
			speak_to_gate_guard()
		_:
			super._on_menu_action(action, data)

func speak_to_commander():
	print("=== FORTRESS COMMANDER ===")
	print("A stern military officer reviews tactical maps.")
	print("'State your business, civilian.'")
	print("Commander: 'This fortress protects the realm's borders.'")
	print("Commander: 'We've had reports of increased bandit activity.'")
	print("Commander: 'Our patrols keep the trade routes safe.'")
	print("The commander eyes you with professional wariness.")
	print("Press ESC to return")

func visit_barracks():
	print("=== MILITARY BARRACKS ===")
	print("Soldiers maintain their equipment and rest between duties.")
	print("The atmosphere is disciplined and efficient.")
	print("Soldier: 'New recruits arrive next week.'")
	print("Soldier: 'The fortress can house 200 soldiers.'")
	print("Soldier: 'Our defenses have never been breached.'")
	print("You sense the camaraderie among the troops.")
	print("Press ESC to return")

func observe_training_grounds():
	print("=== TRAINING GROUNDS ===")
	print("Soldiers practice combat formations and weapon drills.")
	print("The clash of steel and shouted commands fill the air.")
	print("Training Activities:")
	print("• Sword Combat Drills")
	print("• Archery Practice")
	print("• Formation Maneuvers")
	print("• Siege Defense Tactics")
	print("The dedication to military excellence is evident.")
	print("Press ESC to return")

func visit_supply_depot():
	print("=== SUPPLY DEPOT ===")
	print("Quartermaster oversees stacks of military supplies.")
	print("'Every arrow and grain of food is accounted for.'")
	print("Available Supplies:")
	print("• Weapons & Armor - Military Grade")
	print("• Field Rations - Long-lasting Food")
	print("• Medical Supplies - Combat First Aid")
	print("• Engineering Tools - Fortification Equipment")
	print("Press ESC to return")

func speak_to_gate_guard():
	print("=== GATE GUARD ===")
	print("Vigilant sentries monitor all who approach.")
	print("'Halt! What brings you to this military installation?'")
	print("Guard: 'Only authorized personnel beyond this point.'")
	print("Guard: 'We maintain constant watch over the region.'")
	print("Guard: 'Suspicious activity should be reported immediately.'")
	print("The guards remain alert to any potential threats.")
	print("Press ESC to return")