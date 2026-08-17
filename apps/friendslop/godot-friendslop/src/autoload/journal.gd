extends Node


const PATH := "user://journal.cfg"
const SECTION := "dialogue"
const PEOPLE_SECTION := "people"
const QUESTS_SECTION := "quests"
const WORN_SECTION := "worn"
const SATCHEL_SECTION := "satchel"

signal flag_changed(name: String, on: bool)
signal wearing_changed(slots: Dictionary)
signal gained(ref: StringName, count: int, total: int)
signal refused(ref: StringName, count: int)
signal satchel_changed(items: Dictionary)

const COLS := 10
const ROWS := 6

var _state := DialogueState.new()
var _worn: Dictionary = {}
var _satchel: Array[Dictionary] = []
var _quiet := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_state.flag_changed.connect(_on_flag_changed)
	_state.seen_changed.connect(_on_seen_changed)
	_state.asked.connect(_on_asked)
	load_now()


var _speaker := ""


func talking_to(ref: String) -> void:
	_speaker = ref


func speaking_with() -> String:
	return _speaker


func _on_asked(verb: String, argument: String) -> void:
	match verb:
		"quest_start":
			Quests.accept(argument)
		"quest_turn_in":
			Quests.turn_in(argument)
		"xp":
			Vitals.award(Vitals.PLAYER, int(argument))
		"respect":
			adjust_regard(_speaker, int(argument))
		_:
			push_warning("journal: a conversation asked for '%s', which nothing does" % verb)


const RESPECT_RANGE := Vector2i(-5, 10)
const PESTER_GRACE := 1

var _people: Dictionary = {}

signal regard_changed(ref: String, record: Dictionary)


func state() -> DialogueState:
	return _state


func regard(ref: String) -> Dictionary:
	var kept: Variant = _people.get(ref, null)
	if kept is Dictionary:
		return (kept as Dictionary).duplicate()
	return {"talks": 0, "respect": 0, "pestered": 0}


func remember_talk(ref: String, learned: bool) -> Dictionary:
	if ref == "":
		return {}
	var record := regard(ref)
	record["talks"] = int(record["talks"]) + 1
	if learned:
		record["pestered"] = 0
		record["respect"] = mini(int(record["respect"]) + 1, RESPECT_RANGE.y)
	else:
		record["pestered"] = int(record["pestered"]) + 1
		if int(record["pestered"]) > PESTER_GRACE:
			record["respect"] = maxi(int(record["respect"]) - 1, RESPECT_RANGE.x)
	_people[ref] = record
	if not _quiet:
		regard_changed.emit(ref, record.duplicate())
		save_now()
	return record.duplicate()


func adjust_regard(ref: String, delta: int) -> Dictionary:
	if ref == "" or delta == 0:
		return {}
	var record := regard(ref)
	record["respect"] = clampi(
			int(record["respect"]) + delta, RESPECT_RANGE.x, RESPECT_RANGE.y)
	_people[ref] = record
	if not _quiet:
		regard_changed.emit(ref, record.duplicate())
		save_now()
	return record.duplicate()


var _quests: Dictionary = {}


func quest_record(ref: String) -> Dictionary:
	var kept: Variant = _quests.get(ref, null)
	return (kept as Dictionary).duplicate(true) if kept is Dictionary else {}


func set_quest_record(ref: String, record: Dictionary) -> void:
	if ref == "":
		return
	_quests[ref] = record.duplicate(true)
	if not _quiet:
		save_now()


func quest_records() -> Dictionary:
	return _quests.duplicate(true)


func brief(about: String, into: DialogueState) -> void:
	var record := regard(about)
	into.set_number("talks", float(record["talks"]))
	into.set_number("respect", float(record["respect"]))
	into.set_number("pestered", float(record["pestered"]))


func has_flag(name: String) -> bool:
	return _state.has_flag(name)


func set_flag(name: String, on := true) -> void:
	_state.set_flag(name, on)


func _on_flag_changed(name: String, on: bool) -> void:
	if _quiet:
		return
	flag_changed.emit(name, on)
	if Game and Game.events:
		Game.events.notify(EventNames.FLAG_CHANGED, {"flag": name, "on": on})
	save_now()


func _on_seen_changed(_node_id: String) -> void:
	if _quiet:
		return
	save_now()


func wearing() -> Dictionary:
	return _worn.duplicate()


func worn_in(slot: StringName) -> StringName:
	return _worn.get(slot, &"")


func wear(id: StringName) -> void:
	if id == &"" or not Wardrobe.has(id):
		push_warning("journal: nothing in the wardrobe called '%s'" % id)
		return
	_set_worn(Wardrobe.slot_of(id), id)


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


func stacks() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for stack in _satchel:
		out.append(stack.duplicate())
	return out


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


func spend(ref: StringName, count := 1) -> bool:
	if count <= 0 or count_of(ref) < count:
		return false
	var left := count
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


func remove_stack(index: int) -> Dictionary:
	if index < 0 or index >= _satchel.size():
		return {}
	var stack := _satchel[index]
	var out := {"ref": stack["ref"], "count": int(stack["count"])}
	_satchel.remove_at(index)
	if _quiet:
		return out
	satchel_changed.emit(satchel())
	save_now()
	return out


func can_place(index: int, to: Vector2i) -> bool:
	if index < 0 or index >= _satchel.size():
		return false
	return _fits(to, Itemdb.grid_size(_satchel[index]["ref"]), index)


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
	_people.clear()
	for ref: Variant in cfg.get_value(PEOPLE_SECTION, "regard", {}):
		var saved: Variant = cfg.get_value(PEOPLE_SECTION, "regard", {})[ref]
		if saved is not Dictionary:
			continue
		var record: Dictionary = saved
		_people[str(ref)] = {
			"talks": int(record.get("talks", 0)),
			"respect": clampi(int(record.get("respect", 0)), RESPECT_RANGE.x, RESPECT_RANGE.y),
			"pestered": maxi(int(record.get("pestered", 0)), 0),
		}
	_quests.clear()
	var saved_quests: Variant = cfg.get_value(QUESTS_SECTION, "records", {})
	if saved_quests is Dictionary:
		for ref: Variant in saved_quests:
			var kept: Variant = (saved_quests as Dictionary)[ref]
			if kept is not Dictionary:
				continue
			var record: Dictionary = kept
			var counts: Variant = record.get("counts", {})
			_quests[str(ref)] = {
				"status": int(record.get("status", 0)),
				"step": str(record.get("step", "")),
				"counts": (counts as Dictionary).duplicate() if counts is Dictionary else {},
			}
	_worn.clear()
	for slot: Variant in cfg.get_value(WORN_SECTION, "slots", {}):
		var id := StringName(cfg.get_value(WORN_SECTION, "slots", {})[slot])
		if Wardrobe.has(id):
			_worn[StringName(slot)] = id
	_satchel.clear()
	for row: Variant in cfg.get_value(SATCHEL_SECTION, "stacks", []):
		var saved: Dictionary = row
		var id := StringName(saved.get("ref", ""))
		var count := int(saved.get("count", 0))
		if count <= 0 or not Itemdb.has(id):
			continue
		var at := Vector2i(int(saved.get("x", 0)), int(saved.get("y", 0)))
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
	cfg.set_value(PEOPLE_SECTION, "regard", _people.duplicate(true))
	cfg.set_value(QUESTS_SECTION, "records", _quests.duplicate(true))
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


func forget_everything() -> void:
	_state.clear()
	_people.clear()
	_quests.clear()
	_worn.clear()
	_satchel.clear()
	save_now()
	wearing_changed.emit(wearing())
	satchel_changed.emit(satchel())
