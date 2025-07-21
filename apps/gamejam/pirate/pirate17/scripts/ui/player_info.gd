class_name PlayerInfoUI
extends Control

var player_name_label: Label
var health_value_label: Label
var mana_value_label: Label
var energy_value_label: Label

func _ready():
	# Defer initialization to ensure all child nodes are ready
	call_deferred("initialize_ui")

func initialize_ui():
	# Get node references safely with existence checks
	if has_node("Container/PlayerName"):
		player_name_label = get_node("Container/PlayerName")
	
	if has_node("Container/HealthBar/HealthPanel/HealthContainer/HealthValue"):
		health_value_label = get_node("Container/HealthBar/HealthPanel/HealthContainer/HealthValue")
	
	if has_node("Container/ManaBar/ManaPanel/ManaContainer/ManaValue"):
		mana_value_label = get_node("Container/ManaBar/ManaPanel/ManaContainer/ManaValue")
	
	if has_node("Container/EnergyBar/EnergyPanel/EnergyContainer/EnergyValue"):
		energy_value_label = get_node("Container/EnergyBar/EnergyPanel/EnergyContainer/EnergyValue")
	
	# Verify all nodes were found
	if not player_name_label or not health_value_label or not mana_value_label or not energy_value_label:
		print("PlayerInfoUI: Some nodes not found!")
		print("PlayerName:", player_name_label)
		print("HealthValue:", health_value_label)
		print("ManaValue:", mana_value_label)
		print("EnergyValue:", energy_value_label)
		return
	
	update_player_info()
	connect_player_stats()

func update_player_info():
	if not Global.player:
		print("PlayerInfoUI: Global.player is null")
		return
	
	if not player_name_label or not health_value_label or not mana_value_label or not energy_value_label:
		print("PlayerInfoUI: Some UI labels are null")
		return
	
	print("PlayerInfoUI: Updating with player name: ", Global.player.player_name)
	player_name_label.text = Global.player.player_name
	
	if Global.player.stats:
		health_value_label.text = str(Global.player.stats.health) + "/" + str(Global.player.stats.max_health)
		mana_value_label.text = str(Global.player.stats.mana) + "/" + str(Global.player.stats.max_mana)
		energy_value_label.text = str(Global.player.stats.energy) + "/" + str(Global.player.stats.max_energy)
	else:
		print("PlayerInfoUI: Player stats are null")

func connect_player_stats():
	if Global.player and Global.player.stats:
		Global.player.stats.health_changed.connect(_on_health_changed)
		Global.player.stats.mana_changed.connect(_on_mana_changed)
		Global.player.stats.energy_changed.connect(_on_energy_changed)

func _on_health_changed(new_health: int):
	if health_value_label:
		health_value_label.text = str(new_health) + "/" + str(Global.player.stats.max_health)

func _on_mana_changed(new_mana: int):
	if mana_value_label:
		mana_value_label.text = str(new_mana) + "/" + str(Global.player.stats.max_mana)

func _on_energy_changed(new_energy: int):
	if energy_value_label:
		energy_value_label.text = str(new_energy) + "/" + str(Global.player.stats.max_energy)

# Public method to refresh all stats (useful for external calls)
func refresh_display():
	update_player_info()
