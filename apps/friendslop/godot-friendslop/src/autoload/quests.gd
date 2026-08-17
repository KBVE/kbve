extends Node

## What the player has been asked to do, how far through it they are, and what it was
## worth.
##
## The quests themselves are read out of QUESTDB and never change at runtime. What changes
## is one record per quest -- where it is, which step, and how much of that step is done --
## which lives with the rest of the save in the journal, because a quest half-finished is
## exactly the sort of thing that has to survive being closed.
##
## Progress arrives as news rather than being polled. Something happens, whoever saw it
## says so, and any quest that cared moves. Nothing here walks the world looking for work.

const Catalog := preload("res://src/quest/questdb_quests.gd")

## Where a quest is. Ordered, so a condition can ask for "at least active".
enum Status { UNKNOWN = 0, AVAILABLE = 1, ACTIVE = 2, COMPLETE = 3, TURNED_IN = 4 }

const NAMES := {
	Status.UNKNOWN: "unknown",
	Status.AVAILABLE: "available",
	Status.ACTIVE: "active",
	Status.COMPLETE: "complete",
	Status.TURNED_IN: "turned_in",
}

signal accepted(ref: String)
## The step moved on. Carries where it moved to, for anything drawing the tracker.
signal advanced(ref: String, step_id: String)
## Every objective is done. The quest is not finished until it is taken back to whoever
## asked for it, which is what makes the walk back mean something.
signal completed(ref: String)
signal turned_in(ref: String, rewards: Dictionary)


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	## A flag set by anything at all can finish an objective, so this is the one place
	## that has to watch the world rather than be told by the thing that moved it.
	Journal.flag_changed.connect(_on_flag_changed)


## Every quest this game owns.
func catalog() -> Array[Dictionary]:
	return Catalog.all()


func definition(ref: String) -> Dictionary:
	return Catalog.quest(ref)


func status(ref: String) -> Status:
	var record := Journal.quest_record(ref)
	if record.is_empty():
		return Status.AVAILABLE if _openable(ref) else Status.UNKNOWN
	return int(record.get("status", Status.UNKNOWN)) as Status


func status_name(ref: String) -> String:
	return NAMES.get(status(ref), "unknown")


## Which step the player is on, or empty where the quest has not started or has finished.
func step_id(ref: String) -> String:
	return str(Journal.quest_record(ref).get("step", ""))


func step(ref: String) -> Dictionary:
	var wanted := step_id(ref)
	if wanted == "":
		return {}
	for entry in _steps(ref):
		if str(entry["id"]) == wanted:
			return entry
	return {}


## How much of one objective is done.
func progress(ref: String, objective_id: String) -> int:
	var counts: Variant = Journal.quest_record(ref).get("counts", {})
	return int((counts as Dictionary).get(objective_id, 0)) if counts is Dictionary else 0


## Quests the player is in the middle of, for the tracker.
func active() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for quest in catalog():
		var ref := str(quest["ref"])
		var where := status(ref)
		if where == Status.ACTIVE or where == Status.COMPLETE:
			out.append(quest)
	return out


## Takes the quest on, if it is there to take. Answers whether it moved, so a caller can
## tell "accepted" from "already had it".
func accept(ref: String) -> bool:
	if status(ref) != Status.AVAILABLE:
		return false
	var steps := _steps(ref)
	if steps.is_empty():
		push_warning("quests: '%s' has no steps to start" % ref)
		return false
	Journal.set_quest_record(ref, {
		"status": Status.ACTIVE,
		"step": str(steps[0]["id"]),
		"counts": {},
	})
	accepted.emit(ref)
	## Taking a job on is itself talking to whoever offered it, and a first step that says
	## "go and speak to the person you are speaking to" should not need a second visit.
	var speaker := Journal.speaking_with()
	if speaker != "":
		note("interact", speaker)
	_settle(ref)
	return true


## Something happened. `kind` is an objective type -- `interact`, `collect`, `kill` -- and
## `target` is what it happened to.
##
## Every active quest is asked whether it cared. Cheap: a handful of quests with a handful
## of objectives each, only on the step they are actually on.
func note(kind: String, target: String, amount := 1) -> void:
	if amount <= 0:
		return
	for quest in catalog():
		var ref := str(quest["ref"])
		if status(ref) != Status.ACTIVE:
			continue
		var current := step(ref)
		if current.is_empty():
			continue
		var moved := false
		for objective: Dictionary in current["objectives"]:
			if str(objective["type"]) != kind:
				continue
			if not _aimed_at(objective, target):
				continue
			moved = _count(ref, objective, amount) or moved
		if moved:
			_settle(ref)


## Talking to somebody, which is both an objective in its own right and how a finished
## quest is handed back. Going back to whoever asked is the last step of every quest, and
## the only one nothing else can do on the player's behalf.
func met(npc_ref: String) -> void:
	if npc_ref == "":
		return
	note("interact", npc_ref)
	hand_back(npc_ref)


## Gives back anything finished that this person asked for. Kept apart from `met` because
## it is worth trying twice around a conversation: a quest can be finished by something
## said in the middle of one, and waiting for the next visit to notice reads as the game
## not having heard.
func hand_back(npc_ref: String) -> void:
	if npc_ref == "":
		return
	for quest in catalog():
		var ref := str(quest["ref"])
		if status(ref) != Status.COMPLETE:
			continue
		if npc_ref in quest["turn_in"]:
			turn_in(ref)


## Hands the quest back and pays for it. Standing goes to whoever the catalog names, which
## need not be the person who asked -- carrying word to a stranger is worth something with
## the stranger.
func turn_in(ref: String) -> bool:
	if status(ref) != Status.COMPLETE:
		return false
	var quest := definition(ref)
	var rewards: Dictionary = quest.get("rewards", {})
	var record := Journal.quest_record(ref)
	record["status"] = Status.TURNED_IN
	record["step"] = ""
	Journal.set_quest_record(ref, record)

	var experience := int(rewards.get("xp", 0))
	if experience > 0:
		Vitals.award(Vitals.PLAYER, experience)
	var respect := int(rewards.get("respect", 0))
	var with := str(rewards.get("respect_with", ""))
	if respect != 0 and with != "":
		Journal.adjust_regard(with, respect)
	turned_in.emit(ref, rewards.duplicate())
	return true


## Puts every quest's standing in front of a conversation as a number, so a graph can gate
## a line on it in the same breath as a flag: `quest.friendslop-third-plank>=3`.
func brief(into: DialogueState) -> void:
	for quest in catalog():
		var ref := str(quest["ref"])
		into.set_number("quest.%s" % ref, float(status(ref)))


func _steps(ref: String) -> Array:
	var quest := definition(ref)
	var steps: Variant = quest.get("steps", [])
	return steps if steps is Array else []


## Whether an unstarted quest is one the player could be offered. Everything it names has
## to have happened; a quest whose gate is not met is not refused, it is simply not there.
func _openable(ref: String) -> bool:
	var quest := definition(ref)
	if quest.is_empty():
		return false
	for flag: String in quest.get("required_flags", PackedStringArray()):
		if not Journal.has_flag(flag):
			return false
	return true


func _aimed_at(objective: Dictionary, target: String) -> bool:
	var targets: PackedStringArray = objective.get("targets", PackedStringArray())
	## An objective naming nothing is about the kind of thing rather than a particular one:
	## kill three of anything.
	if targets.is_empty():
		return true
	return target in targets


func _count(ref: String, objective: Dictionary, amount: int) -> bool:
	var id := str(objective["id"])
	var wanted := int(objective["amount"])
	var have := progress(ref, id)
	if have >= wanted:
		return false
	var record := Journal.quest_record(ref)
	var counts: Dictionary = record.get("counts", {})
	counts[id] = mini(have + amount, wanted)
	record["counts"] = counts
	Journal.set_quest_record(ref, record)
	return true


## Answers the objectives the world already knows about, then moves the quest on if the
## step is finished. Run after anything that could have changed either.
func _settle(ref: String) -> void:
	var current := step(ref)
	if current.is_empty():
		return
	for objective: Dictionary in current["objectives"]:
		var flag := Catalog.flag_of(objective)
		if flag != "" and Journal.has_flag(flag):
			_count(ref, objective, int(objective["amount"]))
	if not _step_done(ref, current):
		return

	var next := str(current["next"])
	var record := Journal.quest_record(ref)
	if next == "":
		record["status"] = Status.COMPLETE
		record["step"] = ""
		Journal.set_quest_record(ref, record)
		completed.emit(ref)
		return
	record["step"] = next
	Journal.set_quest_record(ref, record)
	advanced.emit(ref, next)
	## The step it just moved to may already be satisfied -- a flag set long before the
	## quest was taken on -- so it is settled in turn rather than left waiting for news
	## that has already been and gone.
	_settle(ref)


func _step_done(ref: String, current: Dictionary) -> bool:
	for objective: Dictionary in current["objectives"]:
		if bool(objective.get("optional", false)):
			continue
		if progress(ref, str(objective["id"])) < int(objective["amount"]):
			return false
	return true


func _on_flag_changed(_name: String, on: bool) -> void:
	if not on:
		return
	for quest in catalog():
		var ref := str(quest["ref"])
		if status(ref) == Status.ACTIVE:
			_settle(ref)
