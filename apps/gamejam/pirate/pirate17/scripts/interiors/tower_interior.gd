class_name TowerInterior
extends BaseInterior

# Specific implementation for tower interiors

func _ready():
	structure_type = StructurePool.StructureType.TOWER
	super._ready()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return "Mysterious Tower"

func populate_menu_actions():
	# Tower-specific actions
	fantasy_menu.add_large_button("Observatory", "observatory")
	fantasy_menu.add_large_button("Wizard's Study", "study")
	fantasy_menu.add_large_button("Arcane Laboratory", "laboratory")
	fantasy_menu.add_menu_button("Ancient Texts", "texts")
	fantasy_menu.add_menu_button("Magical Artifacts", "artifacts")
	fantasy_menu.add_menu_button("Spiral Staircase", "stairs")
	
	# Always add exit option
	fantasy_menu.add_menu_button(exit_button_text, "exit")

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"observatory":
			visit_observatory()
		"study":
			visit_wizard_study()
		"laboratory":
			visit_arcane_laboratory()
		"texts":
			examine_ancient_texts()
		"artifacts":
			examine_magical_artifacts()
		"stairs":
			climb_spiral_staircase()
		_:
			super._on_menu_action(action, data)

func visit_observatory():
	print("=== TOWER OBSERVATORY ===")
	print("Celestial instruments point toward the heavens.")
	print("Star charts and astronomical calculations cover every surface.")
	print("Through the open ceiling, you glimpse the cosmos above.")
	print("'The stars hold secrets beyond mortal comprehension.'")
	print("You feel a deep connection to the mysteries of the universe.")
	print("Press ESC to return")

func visit_wizard_study():
	print("=== WIZARD'S STUDY ===")
	print("Countless books line the curved walls of this chamber.")
	print("A elderly wizard in star-speckled robes looks up from his work.")
	print("'Ah, a visitor! Few dare climb this tower.'")
	print("Wizard: 'I sense magical potential within you.'")
	print("Wizard: 'Perhaps you seek knowledge or magical guidance?'")
	print("The air crackles with arcane energy.")
	print("Press ESC to return")

func visit_arcane_laboratory():
	print("=== ARCANE LABORATORY ===")
	print("Bubbling potions and glowing crystals fill the room.")
	print("Magical circles inscribed on the floor pulse with energy.")
	print("'Careful not to disturb the experiments!' warns a voice.")
	print("Laboratory Equipment:")
	print("• Alchemical Apparatus - Potion Brewing")
	print("• Scrying Crystal - Divination")
	print("• Enchantment Circle - Item Enhancement")
	print("Press ESC to return")

func examine_ancient_texts():
	print("=== ANCIENT TEXTS ===")
	print("Mystical tomes bound in exotic materials line the shelves.")
	print("The knowledge contained here spans millennia.")
	print("Text Titles:")
	print("• 'Fundamentals of Elemental Magic'")
	print("• 'Chronicles of the Astral Plane'")
	print("• 'Secrets of Dimensional Travel'")
	print("• 'The True Names of Ancient Powers'")
	print("The words seem to shimmer with hidden meaning.")
	print("Press ESC to return")

func examine_magical_artifacts():
	print("=== MAGICAL ARTIFACTS ===")
	print("Powerful relics rest in protective enchantments.")
	print("Each artifact hums with contained magical energy.")
	print("Displayed Artifacts:")
	print("• Crystal Orb - Swirling with inner light")
	print("• Ancient Staff - Carved with mystical runes")
	print("• Silver Amulet - Radiating protective aura")
	print("• Bound Grimoire - Locked with magical seals")
	print("'These items are not for the unprepared,' echoes a warning.")
	print("Press ESC to return")

func climb_spiral_staircase():
	print("=== SPIRAL STAIRCASE ===")
	print("Ancient stone steps wind upward through the tower.")
	print("Each level reveals different chambers and mysteries.")
	print("Tower Levels:")
	print("• Ground Floor - Entry Chamber")
	print("• Second Floor - Library & Study")
	print("• Third Floor - Laboratory")
	print("• Fourth Floor - Observatory")
	print("• Roof - Star-gazing Platform")
	print("The stairs echo with the footsteps of countless visitors.")
	print("Press ESC to return")