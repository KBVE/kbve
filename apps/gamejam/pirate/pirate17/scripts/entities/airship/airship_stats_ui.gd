class_name AirshipStatsUI
extends Control

var player_name_label: RichTextLabel
var health_bar: TextureRect
var health_text: Label
var mana_bar: TextureRect
var mana_text: Label
var energy_bar: TextureRect
var energy_text: Label

var current_health: int = 100
var max_health: int = 100
var current_mana: int = 50
var max_mana: int = 50
var current_energy: int = 100
var max_energy: int = 100

# Progress bars use anchor-based layout with offset_right manipulation

func _ready():
	call_deferred("initialize_ui")

func initialize_ui():
	# Get node references with new paths
	var player_name_path = "MainContainer/ContentVBox/PlayerNameSection/PlayerName"
	if has_node(player_name_path):
		player_name_label = get_node(player_name_path)
	
	# Health nodes
	var health_bar_path = "MainContainer/ContentVBox/StatsSection/HealthSection/HealthBarFrame/HealthBar"
	if has_node(health_bar_path):
		health_bar = get_node(health_bar_path)
	
	var health_text_path = "MainContainer/ContentVBox/StatsSection/HealthSection/HealthBarFrame/HealthText"
	if has_node(health_text_path):
		health_text = get_node(health_text_path)
	
	# Mana nodes
	var mana_bar_path = "MainContainer/ContentVBox/StatsSection/ManaSection/ManaBarFrame/ManaBar"
	if has_node(mana_bar_path):
		mana_bar = get_node(mana_bar_path)
	
	var mana_text_path = "MainContainer/ContentVBox/StatsSection/ManaSection/ManaBarFrame/ManaText"
	if has_node(mana_text_path):
		mana_text = get_node(mana_text_path)
	
	# Energy nodes
	var energy_bar_path = "MainContainer/ContentVBox/StatsSection/EnergySection/EnergyBarFrame/EnergyBar"
	if has_node(energy_bar_path):
		energy_bar = get_node(energy_bar_path)
	
	var energy_text_path = "MainContainer/ContentVBox/StatsSection/EnergySection/EnergyBarFrame/EnergyText"
	if has_node(energy_text_path):
		energy_text = get_node(energy_text_path)
	
	# Verify all nodes were found
	if not player_name_label or not health_bar or not mana_bar or not energy_bar:
		print("AirshipStatsUI: Some nodes not found!")
		return
	
	update_player_info()
	connect_player_stats()

func update_player_info():
	var player_ref = Global.player if Global.player else Player
	
	if not player_ref:
		print("AirshipStatsUI: No player reference found")
		return
	
	# Set player name
	if player_ref.player_name and len(player_ref.player_name) > 0:
		player_name_label.text = "[center][color=yellow][font_size=16]" + player_ref.player_name + "[/font_size][/color][/center]"
	else:
		player_name_label.text = "[center][color=yellow][font_size=16]Captain Unknown[/font_size][/color][/center]"
	
	if player_ref.stats:
		# Update bars with current values
		_update_health_bar(player_ref.stats.health, player_ref.stats.max_health)
		_update_mana_bar(player_ref.stats.mana, player_ref.stats.max_mana)
		_update_energy_bar(player_ref.stats.energy, player_ref.stats.max_energy)

func connect_player_stats():
	var player_ref = Global.player if Global.player else Player
	if player_ref and player_ref.stats:
		player_ref.stats.health_changed.connect(_on_health_changed)
		player_ref.stats.mana_changed.connect(_on_mana_changed)
		player_ref.stats.energy_changed.connect(_on_energy_changed)
		print("AirshipStatsUI: Connected to player stats signals")

func _update_health_bar(current: int, maximum: int):
	current_health = current
	max_health = maximum
	
	if health_bar:
		var percentage = float(current) / float(maximum) if maximum > 0 else 0.0
		# Calculate right offset to show the percentage of the bar
		# -12.0 is full width, so we interpolate between -200.0 (empty) and -12.0 (full)
		var offset_right = -12.0 - (188.0 * (1.0 - percentage))
		health_bar.offset_right = offset_right
		
	if health_text:
		health_text.text = str(current) + "/" + str(maximum)

func _update_mana_bar(current: int, maximum: int):
	current_mana = current
	max_mana = maximum
	
	if mana_bar:
		var percentage = float(current) / float(maximum) if maximum > 0 else 0.0
		# Calculate right offset to show the percentage of the bar
		var offset_right = -12.0 - (188.0 * (1.0 - percentage))
		mana_bar.offset_right = offset_right
		
	if mana_text:
		mana_text.text = str(current) + "/" + str(maximum)

func _update_energy_bar(current: int, maximum: int):
	current_energy = current
	max_energy = maximum
	
	if energy_bar:
		var percentage = float(current) / float(maximum) if maximum > 0 else 0.0
		# Calculate right offset to show the percentage of the bar
		var offset_right = -12.0 - (188.0 * (1.0 - percentage))
		energy_bar.offset_right = offset_right
		
	if energy_text:
		energy_text.text = str(current) + "/" + str(maximum)

func _on_health_changed(new_health: int, max_health: int):
	_update_health_bar(new_health, max_health)

func _on_mana_changed(new_mana: int, max_mana: int):
	_update_mana_bar(new_mana, max_mana)

func _on_energy_changed(new_energy: int, max_energy: int):
	_update_energy_bar(new_energy, max_energy)

func refresh_display():
	update_player_info()
