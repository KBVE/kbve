class_name PlayerInfoUI
extends Control

var player_name_label: RichTextLabel
var health_progress_bar: FantasyProgressBar
var mana_progress_bar: FantasyProgressBar  
var energy_progress_bar: FantasyProgressBar

func _ready():
	# Defer initialization to ensure all child nodes are ready
	call_deferred("initialize_ui")

func initialize_ui():
	# Get node references safely with existence checks
	if has_node("Container/PlayerNameContainer/PlayerName"):
		player_name_label = get_node("Container/PlayerNameContainer/PlayerName")
	
	if has_node("Container/HealthBar"):
		health_progress_bar = get_node("Container/HealthBar")
	
	if has_node("Container/ManaBar"):
		mana_progress_bar = get_node("Container/ManaBar")
	
	if has_node("Container/EnergyBar"):
		energy_progress_bar = get_node("Container/EnergyBar")
	
	# Verify all nodes were found
	if not player_name_label or not health_progress_bar or not mana_progress_bar or not energy_progress_bar:
		print("PlayerInfoUI: Some nodes not found!")
		print("PlayerName:", player_name_label)
		print("HealthProgressBar:", health_progress_bar)
		print("ManaProgressBar:", mana_progress_bar)
		print("EnergyProgressBar:", energy_progress_bar)
		return
	
	update_player_info()
	connect_player_stats()

func update_player_info():
	# Try both Global.player and direct Player autoload access
	var player_ref = Global.player if Global.player else Player
	
	if not player_ref:
		print("PlayerInfoUI: No player reference found (Global.player and Player both null)")
		return
	
	if not player_name_label or not health_progress_bar or not mana_progress_bar or not energy_progress_bar:
		print("PlayerInfoUI: Some UI elements are null")
		print("PlayerName label:", player_name_label)
		print("Health progress bar:", health_progress_bar)
		return
	
	print("PlayerInfoUI: Player reference found")
	print("PlayerInfoUI: Player name is: '", player_ref.player_name, "'")
	print("PlayerInfoUI: Player name length: ", len(player_ref.player_name))
	
	# Set player name - use fallback if empty
	if player_ref.player_name and len(player_ref.player_name) > 0:
		player_name_label.text = "[center][color=yellow][font_size=18]" + player_ref.player_name + "[/font_size][/color][/center]"
		print("PlayerInfoUI: Set player name label to: '", player_ref.player_name, "'")
		print("PlayerInfoUI: Player name label BBCode: ", player_name_label.text)
		print("PlayerInfoUI: Player name label visible: ", player_name_label.visible)
		print("PlayerInfoUI: Player name label modulate: ", player_name_label.modulate)
		print("PlayerInfoUI: Player name label size: ", player_name_label.size)
		print("PlayerInfoUI: Player name label position: ", player_name_label.position)
	else:
		player_name_label.text = "[center][color=yellow][font_size=18]Captain Unknown[/font_size][/color][/center]"
		print("PlayerInfoUI: Player name was empty, using fallback")
	
	if player_ref.stats:
		# Update progress bars with current values
		health_progress_bar.set_label_text("Health")
		health_progress_bar.set_value(player_ref.stats.health, player_ref.stats.max_health)
		
		mana_progress_bar.set_label_text("Mana")
		mana_progress_bar.set_value(player_ref.stats.mana, player_ref.stats.max_mana)
		
		energy_progress_bar.set_label_text("Energy")
		energy_progress_bar.set_value(player_ref.stats.energy, player_ref.stats.max_energy)
		
		print("PlayerInfoUI: Updated progress bars - Health:", player_ref.stats.health, "/", player_ref.stats.max_health)
	else:
		print("PlayerInfoUI: Player stats are null")

func connect_player_stats():
	var player_ref = Global.player if Global.player else Player
	if player_ref and player_ref.stats:
		player_ref.stats.health_changed.connect(_on_health_changed)
		player_ref.stats.mana_changed.connect(_on_mana_changed)
		player_ref.stats.energy_changed.connect(_on_energy_changed)
		print("PlayerInfoUI: Connected to player stats signals")
	else:
		print("PlayerInfoUI: Could not connect to player stats")

func _on_health_changed(new_health: int):
	if health_progress_bar:
		var player_ref = Global.player if Global.player else Player
		if player_ref and player_ref.stats:
			health_progress_bar.animate_to_value(new_health)

func _on_mana_changed(new_mana: int):
	if mana_progress_bar:
		var player_ref = Global.player if Global.player else Player
		if player_ref and player_ref.stats:
			mana_progress_bar.animate_to_value(new_mana)

func _on_energy_changed(new_energy: int):
	if energy_progress_bar:
		var player_ref = Global.player if Global.player else Player
		if player_ref and player_ref.stats:
			energy_progress_bar.animate_to_value(new_energy)

# Public method to refresh all stats (useful for external calls)
func refresh_display():
	update_player_info()
