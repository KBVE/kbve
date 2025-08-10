class_name TempleInterior
extends BaseInterior

# Specific implementation for temple interiors

func _ready():
	structure_type = StructurePool.StructureType.TEMPLE
	super._ready()

func get_structure_title() -> String:
	if structure_data.has("name"):
		return structure_data.name
	return "Sacred Temple"

func setup_temple_actions():
	# Override base class with temple-specific actions
	fantasy_menu.add_large_button("Offer Prayer", "pray")
	fantasy_menu.add_large_button("Seek Healing", "healing")
	fantasy_menu.add_large_button("Divine Blessing", "blessing")
	fantasy_menu.add_menu_button("Make Donation", "donate")
	fantasy_menu.add_menu_button("Speak with Priest", "priest")
	fantasy_menu.add_menu_button("Study Scriptures", "study")

func handle_temple_prayer():
	print("=== SACRED PRAYER ===")
	print("You kneel before the altar and offer your prayers.")
	print("A sense of peace washes over you.")
	print("Your spirit feels renewed and your resolve strengthened.")
	
	# Small gameplay benefit
	if Global.player and Global.player.stats:
		var stats = Global.player.stats
		var energy_restore = min(10, stats.max_energy - stats.energy)
		if energy_restore > 0:
			stats.energy += energy_restore
			print("Your energy has been restored by ", energy_restore, " points!")
	
	print("Press ESC to return")

func handle_temple_healing():
	print("=== DIVINE HEALING ===")
	print("The temple priest approaches with healing magic.")
	print("'May the divine light restore your wounds.'")
	
	# Healing gameplay benefit  
	if Global.player and Global.player.stats:
		var stats = Global.player.stats
		var health_restore = min(25, stats.max_health - stats.health)
		if health_restore > 0:
			stats.health += health_restore
			print("Your health has been restored by ", health_restore, " points!")
		else:
			print("You are already at full health.")
	
	print("Press ESC to return")

func _on_menu_action(action: String, data: Dictionary):
	match action:
		"blessing":
			receive_divine_blessing()
		"donate":
			make_temple_donation()
		"priest":
			speak_with_priest()
		"study":
			study_scriptures()
		_:
			super._on_menu_action(action, data)

func receive_divine_blessing():
	print("=== DIVINE BLESSING ===")
	print("The priest raises their hands and speaks ancient words.")
	print("'May fortune favor you on your journey, brave traveler.'")
	print("You feel blessed and protected by divine forces.")
	
	# Temporary blessing effect (could implement actual buffs later)
	print("You have received the Blessing of Safe Travels!")
	print("Press ESC to return")

func make_temple_donation():
	print("=== TEMPLE DONATION ===")
	print("You approach the donation box near the altar.")
	print("Your generous spirit is noted by the divine.")
	print("'Thank you for your kindness,' says the priest.")
	print("'Your charity helps maintain this sacred place.'")
	print("Press ESC to return")

func speak_with_priest():
	print("=== HIGH PRIEST ===")
	print("A robed figure approaches with serene composure.")
	print("'Peace be with you, child. How may I serve?'")
	print("The priest offers wisdom about spiritual matters.")
	print("'Remember, true strength comes from inner peace.'")
	print("Press ESC to return")

func study_scriptures():
	print("=== ANCIENT SCRIPTURES ===")
	print("You examine the sacred texts and illuminated manuscripts.")
	print("The wisdom of ages is preserved in these holy writings.")
	print("You gain insight into the spiritual mysteries of the world.")
	print("'Knowledge without compassion is hollow,' you read.")
	print("Press ESC to return")