class_name RuinsInterior
extends BaseInterior

# Specific implementation for ruins interiors

func _ready():
	structure_type = StructurePool.StructureType.RUINS
	super._ready()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return "Ancient Ruins"

func populate_menu_actions():
	# Ruins-specific actions
	fantasy_menu.add_large_button("Explore Chamber", "explore")
	fantasy_menu.add_large_button("Search for Treasure", "treasure")
	fantasy_menu.add_large_button("Examine Inscriptions", "inscriptions")
	fantasy_menu.add_menu_button("Ancient Altar", "altar")
	fantasy_menu.add_menu_button("Hidden Passages", "passages")
	fantasy_menu.add_menu_button("Mysterious Artifacts", "artifacts")
	
	# Always add exit option
	fantasy_menu.add_menu_button(exit_button_text, "exit")

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"explore":
			explore_chamber()
		"treasure":
			search_for_treasure()
		"inscriptions":
			examine_inscriptions()
		"altar":
			examine_ancient_altar()
		"passages":
			search_hidden_passages()
		"artifacts":
			find_mysterious_artifacts()
		_:
			super._on_menu_action(action, data)

func explore_chamber():
	print("=== EXPLORATION ===")
	print("You venture deeper into the crumbling structure.")
	print("Vines and moss have claimed much of the stonework.")
	print("Shafts of sunlight pierce through collapsed sections.")
	print("The air carries whispers of forgotten civilizations.")
	print("Discovery: You find remnants of ancient pottery.")
	print("Press ESC to return")

func search_for_treasure():
	print("=== TREASURE HUNTING ===")
	print("You carefully search through the debris and rubble.")
	var treasures = [
		"a tarnished silver coin from a lost kingdom",
		"a small jade figurine depicting an unknown deity",
		"fragments of an illuminated manuscript",
		"a crystal shard that glows faintly in the dark",
		"an ornate key that seems to fit no known lock"
	]
	
	var found_treasure = treasures[randi() % treasures.size()]
	print("Fortune smiles upon you!")
	print("You discover: ", found_treasure)
	print("This artifact may prove valuable to collectors or scholars.")
	print("Press ESC to return")

func examine_inscriptions():
	print("=== ANCIENT INSCRIPTIONS ===")
	print("Weathered symbols cover the remaining walls.")
	print("The script belongs to a civilization lost to time.")
	var inscriptions = [
		"'Here lies the wisdom of the star-touched ones.'",
		"'In darkness, seek the light of inner truth.'", 
		"'The greatest treasure is knowledge itself.'",
		"'Time flows like water, but memory endures.'",
		"'Those who came before watch over those who follow.'"
	]
	
	var inscription = inscriptions[randi() % inscriptions.size()]
	print("You decipher one passage: ", inscription)
	print("The words resonate with ancient wisdom.")
	print("Press ESC to return")

func examine_ancient_altar():
	print("=== ANCIENT ALTAR ===")
	print("A stone altar stands at the chamber's heart.")
	print("Carved channels suggest it once held sacred flames.")
	print("Offerings from long-dead pilgrims still rest here.")
	print("You sense a lingering spiritual presence.")
	print("The altar hums with dormant magical energy.")
	print("Perhaps making an offering would awaken something...")
	print("Press ESC to return")

func search_hidden_passages():
	print("=== HIDDEN PASSAGES ===") 
	print("You press against suspicious sections of wall.")
	var passages = [
		"A section gives way, revealing a narrow tunnel leading deeper underground.",
		"You discover a concealed door behind a fallen pillar.", 
		"A loose stone reveals a hidden compartment with ancient scrolls.",
		"The floor reveals a trap door sealed with magical wards.",
		"You find evidence of secret passages, but they've collapsed with age."
	]
	
	var passage = passages[randi() % passages.size()]
	print("Discovery: ", passage)
	print("The ruins hold more secrets than first appeared.")
	print("Press ESC to return")

func find_mysterious_artifacts():
	print("=== MYSTERIOUS ARTIFACTS ===")
	print("Among the ruins, you spot objects of unknown purpose.")
	var artifacts = [
		"A crystalline device that responds to touch with soft light",
		"Metal fragments that seem immune to rust and age",
		"A carved stone that grows warm when held",
		"Glass beads that reflect scenes from the distant past",
		"A small statue that seems to watch you with stone eyes"
	]
	
	var artifact = artifacts[randi() % artifacts.size()]
	print("You discover: ", artifact)
	print("Its true purpose remains a mystery of the ancients.")
	print("Press ESC to return")