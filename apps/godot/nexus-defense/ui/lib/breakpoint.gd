extends Node

enum Klass { MOBILE, TABLET, DESKTOP }

const MOBILE_MAX := 720
const TABLET_MAX := 1180

signal changed(klass: int)

var current: int = Klass.DESKTOP

func _ready() -> void:
	get_viewport().size_changed.connect(_recompute)
	_recompute()

func _recompute() -> void:
	var w: float = get_viewport().get_visible_rect().size.x
	var k := Klass.DESKTOP
	if w <= MOBILE_MAX:
		k = Klass.MOBILE
	elif w <= TABLET_MAX:
		k = Klass.TABLET
	if k != current:
		current = k
		changed.emit(k)

func name_of(k: int = -1) -> String:
	if k == -1:
		k = current
	match k:
		Klass.MOBILE: return "mobile"
		Klass.TABLET: return "tablet"
		_: return "desktop"

func pick(table: Dictionary, fallback: Variant = null) -> Variant:
	var key := name_of()
	if table.has(key):
		return table[key]
	if table.has("desktop"):
		return table["desktop"]
	return fallback

func font(table: Dictionary) -> int:
	return int(pick(table, 16))

func is_mobile() -> bool: return current == Klass.MOBILE
func is_tablet() -> bool: return current == Klass.TABLET
func is_desktop() -> bool: return current == Klass.DESKTOP
func is_touch() -> bool: return current != Klass.DESKTOP
