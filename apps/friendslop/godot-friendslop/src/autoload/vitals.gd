extends Node

## What every body in the world has left, and the only way anything asks for it.
##
## The numbers themselves live in the `q` crate and are stepped on a thread of its own at a
## fixed rate, because the dedicated server has to reach the same answer as the client and
## neither can be allowed to compute health at its own frame rate. This is the counter: it
## hands out the ids, forwards what happened, and reads back the latest snapshot.
##
## The sim answers a tick late by construction. Something enlisted this frame is not known
## until the next one, which is why `knows()` exists and why nothing here pretends to
## return a value it has not been told.

## Which pool, matching the constants on the extension so a caller writes one name.
enum Pool { HEALTH = 0, MANA = 1, ENERGY = 2 }
## Which attribute an investment raises.
enum Attribute { STRENGTH = 0, SKILL = 1, WILL = 2 }

signal downed(id: int)
signal revived(id: int)
signal invested(id: int, attribute: int)

## The player is a fixed id rather than a hashed one: there is exactly one of them, and a
## save that comes back to a differently-named account should still be the same body.
const PLAYER := 1

const CLASS_NAME := &"QVitals"

var _q: Node


func _ready() -> void:
	if not ClassDB.class_exists(CLASS_NAME):
		## A build without the extension still runs; everything here answers zero, which
		## reads on screen as an empty bar rather than a crash on the first frame.
		push_warning("vitals: %s is missing, so nothing has a body" % CLASS_NAME)
		return
	_q = ClassDB.instantiate(CLASS_NAME)
	_q.name = "QVitalsSim"
	add_child(_q)
	_q.downed.connect(func(id: int) -> void: downed.emit(id))
	_q.revived.connect(func(id: int) -> void: revived.emit(id))
	_q.invested.connect(func(id: int, attribute: int) -> void: invested.emit(id, attribute))


## Whether there is a simulation at all. Everything below is safe without one; this is for
## the few callers that would rather do nothing than draw an empty bar.
func running() -> bool:
	return _q != null


## An id for somebody named in the catalog. Hashed rather than counted, so the same person
## is the same body across a save, a scene reload and a second look at the same NPC.
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


## All of it or none of it, for a cost that should refuse rather than half-land.
func spend(id: int, pool: Pool, amount: float) -> void:
	if _q:
		_q.spend(id, int(pool), amount)


## As much of it as there is, for a cost that should not refuse to start.
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


## Zero where there is nothing to be a fraction of, so a bar for somebody the sim has never
## heard of is empty rather than broken.
func fraction(id: int, pool: Pool) -> float:
	return _q.fraction(id, int(pool)) if _q else 0.0


## Whether the pool has enough in it right now, read off the last snapshot. The answer is a
## tick old, which is close enough for a sprint and not close enough for a duel.
func can_afford(id: int, pool: Pool, amount: float) -> bool:
	return current(id, pool) >= amount


func is_down(id: int) -> bool:
	return _q != null and _q.is_down(id)


func experience(id: int) -> int:
	return _q.experience(id) if _q else 0


func rank(id: int, attribute: Attribute) -> int:
	return _q.rank(id, int(attribute)) if _q else 0


## What the next rank costs, so a menu prices the choice from the same curve the sim
## charges it at.
func next_cost(id: int, attribute: Attribute) -> int:
	return _q.next_cost(id, int(attribute)) if _q else 0


func snapshot_of(id: int) -> Dictionary:
	return _q.snapshot_of(id) if _q else {}
