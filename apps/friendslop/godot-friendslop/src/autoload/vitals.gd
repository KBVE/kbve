extends Node


enum Pool { HEALTH = 0, MANA = 1, ENERGY = 2 }
enum Attribute { STRENGTH = 0, SKILL = 1, WILL = 2 }

signal downed(id: int)
signal revived(id: int)
signal invested(id: int, attribute: int)

const PLAYER := 1

const CLASS_NAME := &"QVitals"

var _q: Node


func _ready() -> void:
	if not ClassDB.class_exists(CLASS_NAME):
		push_warning("vitals: %s is missing, so nothing has a body" % CLASS_NAME)
		return
	_q = ClassDB.instantiate(CLASS_NAME)
	_q.name = "QVitalsSim"
	add_child(_q)
	_q.downed.connect(func(id: int) -> void: downed.emit(id))
	_q.revived.connect(func(id: int) -> void: revived.emit(id))
	_q.invested.connect(func(id: int, attribute: int) -> void: invested.emit(id, attribute))


func running() -> bool:
	return _q != null


func id_for(ref: String) -> int:
	return hash(ref) if ref != "" else 0


func enlist(id: int, strength := 1, skill := 1, will := 1) -> void:
	if _q:
		_q.spawn_character(id, strength, skill, will)


func retire(id: int) -> void:
	if _q:
		_q.despawn_character(id)


func knows(id: int) -> bool:
	return _q != null and _q.knows(id)


func damage(id: int, amount: float) -> void:
	if _q:
		_q.damage(id, amount)


func heal(id: int, amount: float) -> void:
	if _q:
		_q.heal(id, amount)


func revive(id: int, fraction := 0.5) -> void:
	if _q:
		_q.revive(id, fraction)


func spend(id: int, pool: Pool, amount: float) -> void:
	if _q:
		_q.spend(id, int(pool), amount)


func drain(id: int, pool: Pool, amount: float) -> void:
	if _q:
		_q.drain(id, int(pool), amount)


func award(id: int, experience: int) -> void:
	if _q:
		_q.award(id, experience)


func invest(id: int, attribute: Attribute) -> void:
	if _q:
		_q.invest(id, int(attribute))


func current(id: int, pool: Pool) -> float:
	return _q.current(id, int(pool)) if _q else 0.0


func maximum(id: int, pool: Pool) -> float:
	return _q.maximum(id, int(pool)) if _q else 0.0


func fraction(id: int, pool: Pool) -> float:
	return _q.fraction(id, int(pool)) if _q else 0.0


func can_afford(id: int, pool: Pool, amount: float) -> bool:
	return current(id, pool) >= amount


func is_down(id: int) -> bool:
	return _q != null and _q.is_down(id)


func experience(id: int) -> int:
	return _q.experience(id) if _q else 0


func rank(id: int, attribute: Attribute) -> int:
	return _q.rank(id, int(attribute)) if _q else 0


func next_cost(id: int, attribute: Attribute) -> int:
	return _q.next_cost(id, int(attribute)) if _q else 0


func snapshot_of(id: int) -> Dictionary:
	return _q.snapshot_of(id) if _q else {}
