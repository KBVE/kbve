extends GdUnitTestSuite

const Breakpoint := preload("res://ui/lib/breakpoint.gd")

func test_classify_mobile_threshold() -> void:
	assert_int(Breakpoint.classify(320.0)).is_equal(Breakpoint.Klass.MOBILE)
	assert_int(Breakpoint.classify(720.0)).is_equal(Breakpoint.Klass.MOBILE)

func test_classify_tablet_band() -> void:
	assert_int(Breakpoint.classify(721.0)).is_equal(Breakpoint.Klass.TABLET)
	assert_int(Breakpoint.classify(1024.0)).is_equal(Breakpoint.Klass.TABLET)
	assert_int(Breakpoint.classify(1180.0)).is_equal(Breakpoint.Klass.TABLET)

func test_classify_desktop_above_tablet_max() -> void:
	assert_int(Breakpoint.classify(1181.0)).is_equal(Breakpoint.Klass.DESKTOP)
	assert_int(Breakpoint.classify(1920.0)).is_equal(Breakpoint.Klass.DESKTOP)
	assert_int(Breakpoint.classify(3840.0)).is_equal(Breakpoint.Klass.DESKTOP)

func test_autoload_present() -> void:
	var bp: Node = Engine.get_main_loop().root.get_node_or_null("/root/Bp")
	assert_object(bp).is_not_null()

func test_name_of_maps_enum() -> void:
	var bp: Node = Engine.get_main_loop().root.get_node("/root/Bp")
	assert_str(bp.name_of(Breakpoint.Klass.MOBILE)).is_equal("mobile")
	assert_str(bp.name_of(Breakpoint.Klass.TABLET)).is_equal("tablet")
	assert_str(bp.name_of(Breakpoint.Klass.DESKTOP)).is_equal("desktop")

func test_pick_falls_back_to_desktop_when_missing_key() -> void:
	var bp: Node = Engine.get_main_loop().root.get_node("/root/Bp")
	var table := {"desktop": 99}
	assert_int(int(bp.pick(table))).is_equal(99)

func test_pick_returns_fallback_when_table_empty() -> void:
	var bp: Node = Engine.get_main_loop().root.get_node("/root/Bp")
	assert_int(int(bp.pick({}, 42))).is_equal(42)

func test_font_returns_int() -> void:
	var bp: Node = Engine.get_main_loop().root.get_node("/root/Bp")
	var table := {"mobile": 10, "tablet": 14, "desktop": 18}
	var size := int(bp.font(table))
	assert_int(size).is_greater_equal(10)
	assert_int(size).is_less_equal(18)
