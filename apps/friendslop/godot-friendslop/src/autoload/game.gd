extends Node

var world: ECSWorld
var events: GameEventCenter
var observers: ObserverHub
var relations: Relations

var _logic: ECSRunner
var _physics: ECSRunner
var _scheduler: ECSScheduler


func _ready() -> void:
	events = GameEventCenter.new()
	world = ECSWorld.new("friendslop")
	observers = ObserverHub.new()
	relations = Relations.new()
	relations.relation_added.connect(func(s: int, r: StringName, t: int, d: Variant) -> void:
		events.notify(EventNames.RELATION_ADDED, {"source": s, "rel": r, "target": t, "data": d}))
	relations.relation_removed.connect(func(s: int, r: StringName, t: int) -> void:
		events.notify(EventNames.RELATION_REMOVED, {"source": s, "rel": r, "target": t}))
	_logic = world.create_runner("logic")
	_physics = world.create_runner("physics")


func spawn(id: int = 0) -> ECSEntity:
	var e := world.create_entity(id)
	observers.track(e)
	return e


func despawn(e: ECSEntity) -> void:
	relations.unlink_all(e.id())
	observers.untrack(e)
	world.remove_entity(e.id())


func _process(delta: float) -> void:
	_logic.run(delta)
	if _scheduler:
		_scheduler.run(delta)


func _physics_process(delta: float) -> void:
	_physics.run(delta)


func _exit_tree() -> void:
	events.clear()
	world.clear()


func logic() -> ECSRunner:
	return _logic


func physics() -> ECSRunner:
	return _physics


func scheduler() -> ECSScheduler:
	if not _scheduler:
		_scheduler = world.create_scheduler("parallel")
	return _scheduler
