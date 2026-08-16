extends Node

## Everything the player has been told and agreed to, kept for good.
##
## A conversation writes flags and the nodes it has been through; both outlive the talk
## that set them, and the toll paid last night has to still be paid this morning. This is
## the one copy: the interactor reads it rather than carrying its own, so anything else
## that can talk shares the same memory of what was said.
##
## Flag changes also go out on the world's event bus, which is what lets something that is
## not a conversation react to one.

const PATH := "user://journal.cfg"
const SECTION := "dialogue"
const WORN_SECTION := "worn"
const SATCHEL_SECTION := "satchel"

signal flag_changed(name: String, on: bool)
## What the player has on, slot by slot. The rig watches this rather than being told
## directly, so anything that hands out clothing does not need to know where the body is.
signal wearing_changed(slots: Dictionary)
## One lot of something arriving, for whatever wants to say so on screen. Carries what
## came in rather than the new total, because "+3 Bark" is the news and "you have 11" is
## a thing that can be asked for.
signal gained(ref: StringName, count: int, total: int)
## Something that would not fit, and how much of it was left over. The bag is finite, so
## this is the difference between loot vanishing quietly and the player being told.
signal refused(ref: StringName, count: int)
## The whole satchel changed, for anything drawing all of it.
signal satchel_changed(items: Dictionary)

## A spatial bag, so what you can carry is a question of shape and not only of number.
## Ten across is the width the panel is drawn to; six down is roomy enough that a
## morning's chopping does not fill it, while armour at 2x2 still has to be arranged.
const COLS := 10
const ROWS := 6

var _state := DialogueState.new()
## Slot to wardrobe piece id.
var _worn: Dictionary = {}
## Placed stacks, each `{ref, count, x, y}`. A list rather than a ref-to-count map,
## because the same thing can sit in two places once one stack is full, and where it
## sits is part of what the player owns.
var _satchel: Array[Dictionary] = []
## Held down while loading, so reading a saved file does not read as the player having
## just done all of it.
var _quiet := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_state.flag_changed.connect(_on_flag_changed)
	_state.seen_changed.connect(_on_seen_changed)
	load_now()


func state() -> DialogueState:
	return _state


func has_flag(name: String) -> bool:
	return _state.has_flag(name)


## For anything outside a conversation that has news of its own -- a bridge crossed, a
## fish landed -- so the graphs can ask about it in the same breath as the toll.
func set_flag(name: String, on := true) -> void:
	_state.set_flag(name, on)


func _on_flag_changed(name: String, on: bool) -> void:
	if _quiet:
		return
	flag_changed.emit(name, on)
	if Game and Game.events:
		Game.events.notify(EventNames.FLAG_CHANGED, {"flag": name, "on": on})
	save_now()


## A node is only ever seen for the first time once, so this is rare enough to write out
## on the spot rather than hope the game is closed politely.
func _on_seen_changed(_node_id: String) -> void:
	if _quiet:
		return
	save_now()


## What the player is wearing, slot by slot.
func wearing() -> Dictionary:
	return _worn.duplicate()


func worn_in(slot: StringName) -> StringName:
	return _worn.get(slot, &"")


## Puts a piece on, or takes the slot's piece off when given nothing. One piece to a slot,
## which is the wardrobe's rule as much as the rig's.
func wear(id: StringName) -> void:
	if id == &"" or not Wardrobe.has(id):
		push_warning("journal: nothing in the wardrobe called '%s'" % id)
		return
	_set_worn(Wardrobe.slot_of(id), id)


## Puts on whatever the catalog says this item looks like. The item decides the slot, so
## nothing handing one out has to know where it goes.
func wear_item(ref: StringName) -> bool:
	var piece := Itemdb.wardrobe_piece(ref)
	if piece == &"":
		push_warning("journal: '%s' is not something that can be worn" % ref)
		return false
	_set_worn(Wardrobe.slot_of(piece), piece)
	return true


func take_off(slot: StringName) -> void:
	_set_worn(slot, &"")


func _set_worn(slot: StringName, id: StringName) -> void:
	if slot == &"":
		return
	if _worn.get(slot, &"") == id:
		return
	if id == &"":
		_worn.erase(slot)
	else:
		_worn[slot] = id
	if _quiet:
		return
	wearing_changed.emit(wearing())
	save_now()


## Every placed stack, as copies: the caller cannot rearrange the bag by editing them.
func stacks() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for stack in _satchel:
		out.append(stack.duplicate())
	return out


## Everything held, as ref to total count, for anything that only cares how much.
func satchel() -> Dictionary:
	var out := {}
	for stack in _satchel:
		var ref: StringName = stack["ref"]
		out[ref] = int(out.get(ref, 0)) + int(stack["count"])
	return out


func count_of(ref: StringName) -> int:
	var total := 0
	for stack in _satchel:
		if stack["ref"] == ref:
			total += int(stack["count"])
	return total


## Puts something in the bag, and says how much would not go in.
##
## Fills open stacks before opening new ones, so a bag does not fragment into part-full
## cells of the same thing while there is still room in one.
##
## Refuses anything the itemdb does not know, rather than inventing a slot for it: a
## typo'd ref should read as nothing arriving, not as a phantom item that no UI can draw
## and no recipe can spend.
func gain(ref: StringName, count := 1) -> int:
	if ref == &"" or count <= 0:
		return maxi(count, 0)
	if not Itemdb.has(ref):
		push_warning("journal: nothing called '%s' to put in the satchel" % ref)
		return count

	var left := count
	var per_stack := Itemdb.max_stack(ref)
	for stack in _satchel:
		if left <= 0:
			break
		if stack["ref"] != ref:
			continue
		var room: int = per_stack - int(stack["count"])
		if room <= 0:
			continue
		var moved := mini(room, left)
		stack["count"] = int(stack["count"]) + moved
		left -= moved

	var size := Itemdb.grid_size(ref)
	while left > 0:
		var at := _free_cell(size)
		if at.x < 0:
			break
		var moved := mini(per_stack, left)
		_satchel.append({"ref": ref, "count": moved, "x": at.x, "y": at.y})
		left -= moved

	var took := count - left
	if _quiet:
		return left
	if took > 0:
		gained.emit(ref, took, count_of(ref))
		satchel_changed.emit(satchel())
		save_now()
	if left > 0:
		refused.emit(ref, left)
	return left


## Takes something out, and says whether there was enough to take. All or nothing: a
## recipe that half-pays for itself is worse than one that does not fire.
func spend(ref: StringName, count := 1) -> bool:
	if count <= 0 or count_of(ref) < count:
		return false
	var left := count
	# Emptiest first, so spending tidies the bag up rather than leaving a trail of
	# part-full stacks behind it.
	var order := range(_satchel.size())
	order.sort_custom(func(a: int, b: int) -> bool:
			return int(_satchel[a]["count"]) < int(_satchel[b]["count"]))
	for i: int in order:
		if left <= 0:
			break
		if _satchel[i]["ref"] != ref:
			continue
		var taken: int = mini(int(_satchel[i]["count"]), left)
		_satchel[i]["count"] = int(_satchel[i]["count"]) - taken
		left -= taken
	_satchel = _satchel.filter(func(s: Dictionary) -> bool: return int(s["count"]) > 0)
	if _quiet:
		return true
	satchel_changed.emit(satchel())
	save_now()
	return true


## Whether a stack could be put down at `to`. What a panel asks while dragging, so the
## answer it previews and the answer it gets are the same one.
func can_place(index: int, to: Vector2i) -> bool:
	if index < 0 or index >= _satchel.size():
		return false
	return _fits(to, Itemdb.grid_size(_satchel[index]["ref"]), index)


## Moves a stack to a cell, if it fits there. The stack being moved does not block its
## own destination, or nothing could ever be nudged one square.
func move_stack(index: int, to: Vector2i) -> bool:
	if index < 0 or index >= _satchel.size():
		return false
	var stack := _satchel[index]
	var size := Itemdb.grid_size(stack["ref"])
	if not _fits(to, size, index):
		return false
	stack["x"] = to.x
	stack["y"] = to.y
	if _quiet:
		return true
	satchel_changed.emit(satchel())
	save_now()
	return true


## Whether a `size` rectangle at `at` is on the board and clear of everything except
## `ignore`, which is the stack being moved.
func _fits(at: Vector2i, size: Vector2i, ignore := -1) -> bool:
	if at.x < 0 or at.y < 0 or at.x + size.x > COLS or at.y + size.y > ROWS:
		return false
	for i in _satchel.size():
		if i == ignore:
			continue
		var other := _satchel[i]
		var other_size := Itemdb.grid_size(other["ref"])
		var overlaps_x: bool = at.x < int(other["x"]) + other_size.x and int(other["x"]) < at.x + size.x
		var overlaps_y: bool = at.y < int(other["y"]) + other_size.y and int(other["y"]) < at.y + size.y
		if overlaps_x and overlaps_y:
			return false
	return true


## Topmost-leftmost cell a `size` rectangle fits in, or (-1, -1) when the bag is full.
## Reading order, so things pile up from the corner the eye starts at.
func _free_cell(size: Vector2i) -> Vector2i:
	for y in ROWS:
		for x in COLS:
			if _fits(Vector2i(x, y), size):
				return Vector2i(x, y)
	return Vector2i(-1, -1)


func load_now() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(PATH) != OK:
		return
	_quiet = true
	_state.from_dict({
		"flags": cfg.get_value(SECTION, "flags", {}),
		"seen": cfg.get_value(SECTION, "seen", {}),
	})
	_worn.clear()
	for slot: Variant in cfg.get_value(WORN_SECTION, "slots", {}):
		var id := StringName(cfg.get_value(WORN_SECTION, "slots", {})[slot])
		## A save naming a piece that is no longer in the folder is dropped rather than
		## kept, or the rig warns about it every time it is built.
		if Wardrobe.has(id):
			_worn[StringName(slot)] = id
	_satchel.clear()
	for row: Variant in cfg.get_value(SATCHEL_SECTION, "stacks", []):
		var saved: Dictionary = row
		var id := StringName(saved.get("ref", ""))
		var count := int(saved.get("count", 0))
		# Same rule as the wardrobe: a save naming an item the itemdb no longer has is
		# dropped rather than carried, so a renamed drop does not haunt the bag.
		if count <= 0 or not Itemdb.has(id):
			continue
		var at := Vector2i(int(saved.get("x", 0)), int(saved.get("y", 0)))
		# A stack that no longer fits where it was saved -- the grid shrank, or the item
		# grew -- is re-placed rather than dropped. Losing the arrangement is a nuisance;
		# losing the loot is not something a save format change should ever do.
		if not _fits(at, Itemdb.grid_size(id)):
			at = _free_cell(Itemdb.grid_size(id))
			if at.x < 0:
				continue
		_satchel.append({"ref": id, "count": count, "x": at.x, "y": at.y})
	_quiet = false
	wearing_changed.emit(wearing())
	satchel_changed.emit(satchel())


func save_now() -> void:
	var cfg := ConfigFile.new()
	var body := _state.to_dict()
	cfg.set_value(SECTION, "flags", body["flags"])
	cfg.set_value(SECTION, "seen", body["seen"])
	var slots := {}
	for slot: StringName in _worn:
		slots[String(slot)] = String(_worn[slot])
	cfg.set_value(WORN_SECTION, "slots", slots)
	var rows := []
	for stack in _satchel:
		rows.append({
			"ref": String(stack["ref"]),
			"count": int(stack["count"]),
			"x": int(stack["x"]),
			"y": int(stack["y"]),
		})
	cfg.set_value(SATCHEL_SECTION, "stacks", rows)
	cfg.save(PATH)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_PREDELETE:
		save_now()


## Wipes the slate. Kept for a fresh start rather than called anywhere yet -- an existing
## player's memory is not something to clear by accident.
func forget_everything() -> void:
	_state.clear()
	_worn.clear()
	_satchel.clear()
	save_now()
	wearing_changed.emit(wearing())
	satchel_changed.emit(satchel())
