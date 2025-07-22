class_name Stats
extends RefCounted

signal health_changed(new_value: int, max_value: int)
signal mana_changed(new_value: int, max_value: int)
signal energy_changed(new_value: int, max_value: int)

var max_health: int = 100
var max_mana: int = 50
var max_energy: int = 75

var _health: int = 100
var _mana: int = 50
var _energy: int = 75

# Equipment stats
var base_attack: int = 10
var base_defense: int = 5

var health: int:
	get:
		return _health
	set(value):
		_health = clamp(value, 0, max_health)
		health_changed.emit(_health, max_health)

var mana: int:
	get:
		return _mana
	set(value):
		_mana = clamp(value, 0, max_mana)
		mana_changed.emit(_mana, max_mana)

var energy: int:
	get:
		return _energy
	set(value):
		var old_energy = _energy
		_energy = clamp(value, 0, max_energy)
		print("Stats: Energy changed from ", old_energy, " to ", _energy, " (max: ", max_energy, ")")
		energy_changed.emit(_energy, max_energy)

func _init():
	health = max_health
	mana = max_mana
	energy = max_energy

func is_alive() -> bool:
	return health > 0

func heal(amount: int):
	health += amount

func damage(amount: int):
	health -= amount

func use_mana(amount: int) -> bool:
	if mana >= amount:
		mana -= amount
		return true
	return false

func restore_mana(amount: int):
	mana += amount

func use_energy(amount: int) -> bool:
	if energy >= amount:
		energy -= amount
		return true
	return false

func restore_energy(amount: int):
	energy += amount

func deplete_energy_or_health(energy_cost: int = 1, health_cost: int = 1):
	"""Deplete energy first, then health if no energy available"""
	print("Stats: deplete_energy_or_health called - current energy: ", energy, ", cost: ", energy_cost)
	if energy >= energy_cost:
		energy -= energy_cost
		print("Stats: Deducted energy, new value: ", energy)
	else:
		health -= health_cost
		print("Stats: No energy, deducted health, new value: ", health)

func is_exhausted() -> bool:
	"""Check if player has no energy"""
	return energy <= 0
