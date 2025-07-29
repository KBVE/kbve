class_name NPC
extends Node2D

signal health_changed(new_health: int, max_health: int)
signal died

@export var max_health: int = 20
@export var max_mana: int = 20

var current_health: int
var current_mana: int

func _ready():
	current_health = max_health
	current_mana = max_mana

func take_damage(damage: int):
	current_health = max(0, current_health - damage)
	health_changed.emit(current_health, max_health)
	
	if current_health <= 0:
		die()

func heal(amount: int):
	current_health = min(max_health, current_health + amount)
	health_changed.emit(current_health, max_health)

func consume_mana(amount: int) -> bool:
	if current_mana >= amount:
		current_mana -= amount
		return true
	return false

func restore_mana(amount: int):
	current_mana = min(max_mana, current_mana + amount)

func die():
	died.emit()

func get_health_percentage() -> float:
	return float(current_health) / float(max_health)

func get_mana_percentage() -> float:
	return float(current_mana) / float(max_mana)