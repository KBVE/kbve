extends Node2D

signal battle_ended(won: bool)

@onready var battle_menu_panel = $CanvasLayer/BattleMenuPanel
@onready var fight_menu_panel = $CanvasLayer/FightMenuPanel
@onready var crew_menu_panel = $CanvasLayer/CrewMenuPanel
@onready var item_menu_panel = $CanvasLayer/ItemMenuPanel
@onready var text_view = $CanvasLayer/TextView/RichTextLabel
@onready var player_health_bar = $CanvasLayer/PlayerBars/HealthBar
@onready var player_energy_bar = $CanvasLayer/PlayerBars/EnergyBar
@onready var enemy_health_bar = $CanvasLayer/EnemyBars/HealthBar
@onready var enemy_energy_bar = $CanvasLayer/EnemyBars/EnergyBar

var player_ship_data = {}
var enemy_ship_data = {}
var current_turn = "player"
var battle_active = false
var previous_scene_tree_paused = false

func _ready():
	hide()
	set_process(false)
	connect_battle_buttons()
	
func connect_battle_buttons():
	if battle_menu_panel:
		battle_menu_panel.get_node("FightButton").pressed.connect(_on_fight_pressed)
		battle_menu_panel.get_node("CrewButton").pressed.connect(_on_crew_pressed)
		battle_menu_panel.get_node("ItemButton").pressed.connect(_on_item_pressed)
		battle_menu_panel.get_node("RunButton").pressed.connect(_on_run_pressed)
	
	if fight_menu_panel:
		for i in range(1, 5):
			var button = fight_menu_panel.get_node("MenuButton" + str(i))
			if button:
				button.pressed.connect(_on_attack_selected.bind(i))
	
	if crew_menu_panel:
		for i in range(1, 5):
			var button = crew_menu_panel.get_node("MenuButton" + str(i))
			if button:
				button.pressed.connect(_on_crew_member_selected.bind(i))
	
	if item_menu_panel:
		for i in range(1, 5):
			var button = item_menu_panel.get_node("MenuButton" + str(i))
			if button:
				button.pressed.connect(_on_item_selected.bind(i))

func start_battle(player_data: Dictionary, enemy_data: Dictionary):
	player_ship_data = player_data.duplicate()
	enemy_ship_data = enemy_data.duplicate()
	
	if not player_ship_data.has("health"):
		player_ship_data.health = 100
	if not player_ship_data.has("max_health"):
		player_ship_data.max_health = 100
	if not player_ship_data.has("energy"):
		player_ship_data.energy = 100
	if not player_ship_data.has("max_energy"):
		player_ship_data.max_energy = 100
	if not player_ship_data.has("mana"):
		player_ship_data.mana = 50
	if not player_ship_data.has("max_mana"):
		player_ship_data.max_mana = 50
	
	if not enemy_ship_data.has("health"):
		enemy_ship_data.health = 80
	if not enemy_ship_data.has("max_health"):
		enemy_ship_data.max_health = 80
	if not enemy_ship_data.has("energy"):
		enemy_ship_data.energy = 60
	if not enemy_ship_data.has("max_energy"):
		enemy_ship_data.max_energy = 60
	
	previous_scene_tree_paused = get_tree().paused
	get_tree().paused = true
	
	show()
	set_process(true)
	battle_active = true
	current_turn = "player"
	
	update_display()
	show_battle_text("A naval battle has begun!")
	
	reset_menu_visibility()

func reset_menu_visibility():
	battle_menu_panel.show()
	fight_menu_panel.hide()
	crew_menu_panel.hide()
	item_menu_panel.hide()

func update_display():
	if player_health_bar:
		player_health_bar.set_current_value(player_ship_data.health)
		player_health_bar.set_max_value(player_ship_data.max_health)
	
	if player_energy_bar:
		player_energy_bar.set_current_value(player_ship_data.energy)
		player_energy_bar.set_max_value(player_ship_data.max_energy)
	
	if enemy_health_bar:
		enemy_health_bar.set_current_value(enemy_ship_data.health)
		enemy_health_bar.set_max_value(enemy_ship_data.max_health)
	
	if enemy_energy_bar:
		enemy_energy_bar.set_current_value(enemy_ship_data.energy)
		enemy_energy_bar.set_max_value(enemy_ship_data.max_energy)

func show_battle_text(text: String):
	if text_view:
		text_view.text = text

func _on_fight_pressed():
	battle_menu_panel.hide()
	fight_menu_panel.show()

func _on_crew_pressed():
	battle_menu_panel.hide()
	crew_menu_panel.show()

func _on_item_pressed():
	battle_menu_panel.hide()
	item_menu_panel.show()

func _on_run_pressed():
	var escape_chance = randf()
	if escape_chance > 0.5:
		show_battle_text("You successfully escaped!")
		await get_tree().create_timer(1.5).timeout
		end_battle(false)
	else:
		show_battle_text("Escape failed! The enemy attacks!")
		await get_tree().create_timer(1.0).timeout
		enemy_turn()

func _on_attack_selected(attack_num: int):
	fight_menu_panel.hide()
	
	var damage = 0
	var energy_cost = 0
	var attack_name = ""
	
	match attack_num:
		1:
			attack_name = "Cannon Barrage"
			damage = randi_range(15, 25)
			energy_cost = 10
		2:
			attack_name = "Harpoon Strike"
			damage = randi_range(20, 30)
			energy_cost = 20
		3:
			attack_name = "Fire Bomb"
			damage = randi_range(25, 35)
			energy_cost = 30
		4:
			attack_name = "Ultimate Broadside"
			damage = randi_range(35, 50)
			energy_cost = 50
	
	if player_ship_data.energy >= energy_cost:
		player_ship_data.energy -= energy_cost
		enemy_ship_data.health -= damage
		show_battle_text("Your %s dealt %d damage!" % [attack_name, damage])
		update_display()
		
		if enemy_ship_data.health <= 0:
			await get_tree().create_timer(1.5).timeout
			victory()
		else:
			await get_tree().create_timer(1.5).timeout
			enemy_turn()
	else:
		show_battle_text("Not enough energy for %s!" % attack_name)
		await get_tree().create_timer(1.0).timeout
		reset_menu_visibility()

func _on_crew_member_selected(crew_num: int):
	crew_menu_panel.hide()
	
	match crew_num:
		1:
			player_ship_data.health = min(player_ship_data.health + 20, player_ship_data.max_health)
			show_battle_text("Ship Medic healed 20 HP!")
		2:
			player_ship_data.energy = min(player_ship_data.energy + 15, player_ship_data.max_energy)
			show_battle_text("Engineer restored 15 energy!")
		3:
			var boost = 10
			show_battle_text("Gunner boosted attack power!")
		4:
			player_ship_data.mana = min(player_ship_data.mana + 10, player_ship_data.max_mana)
			show_battle_text("Navigator restored 10 mana!")
	
	update_display()
	await get_tree().create_timer(1.5).timeout
	enemy_turn()

func _on_item_selected(item_num: int):
	item_menu_panel.hide()
	
	match item_num:
		1:
			player_ship_data.health = min(player_ship_data.health + 30, player_ship_data.max_health)
			show_battle_text("Used Health Potion! Restored 30 HP!")
		2:
			player_ship_data.energy = min(player_ship_data.energy + 25, player_ship_data.max_energy)
			show_battle_text("Used Energy Drink! Restored 25 energy!")
		3:
			enemy_ship_data.health -= 20
			show_battle_text("Threw Fire Bomb! Dealt 20 damage!")
		4:
			player_ship_data.health = player_ship_data.max_health
			player_ship_data.energy = player_ship_data.max_energy
			show_battle_text("Used Full Restore! HP and Energy maxed!")
	
	update_display()
	
	if enemy_ship_data.health <= 0:
		await get_tree().create_timer(1.5).timeout
		victory()
	else:
		await get_tree().create_timer(1.5).timeout
		enemy_turn()

func enemy_turn():
	current_turn = "enemy"
	
	var action = randi() % 100
	
	if action < 60:
		var damage = randi_range(10, 20)
		player_ship_data.health -= damage
		show_battle_text("Enemy cannon fire dealt %d damage!" % damage)
	elif action < 80:
		var damage = randi_range(15, 25)
		player_ship_data.health -= damage
		enemy_ship_data.energy -= 15
		show_battle_text("Enemy special attack dealt %d damage!" % damage)
	else:
		enemy_ship_data.health = min(enemy_ship_data.health + 15, enemy_ship_data.max_health)
		show_battle_text("Enemy repaired their ship! +15 HP")
	
	update_display()
	
	if player_ship_data.health <= 0:
		await get_tree().create_timer(1.5).timeout
		defeat()
	else:
		await get_tree().create_timer(1.5).timeout
		current_turn = "player"
		reset_menu_visibility()

func victory():
	show_battle_text("Victory! You defeated the enemy ship!")
	battle_active = false
	await get_tree().create_timer(2.0).timeout
	end_battle(true)

func defeat():
	show_battle_text("Defeat... Your ship was destroyed!")
	battle_active = false
	await get_tree().create_timer(2.0).timeout
	end_battle(false)

func end_battle(won: bool):
	get_tree().paused = previous_scene_tree_paused
	hide()
	set_process(false)
	battle_active = false
	battle_ended.emit(won)

func _input(event):
	if not battle_active:
		return
	
	if event.is_action_pressed("ui_cancel"):
		if fight_menu_panel.visible or crew_menu_panel.visible or item_menu_panel.visible:
			fight_menu_panel.hide()
			crew_menu_panel.hide()
			item_menu_panel.hide()
			battle_menu_panel.show()