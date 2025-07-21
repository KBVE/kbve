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
        _energy = clamp(value, 0, max_energy)
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
