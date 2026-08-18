extends GdUnitTestSuite


const TITLE := preload("res://src/title_screen.gd")
const GFX := preload("res://src/settings/graphics_settings.gd")

const BOOST := 1.8
const RANGE_BOOST := 1.35


func test_boost_scales_the_tier_the_player_is_on() -> void:
	for tier in GFX.TIERS.size():
		var row: Dictionary = GFX.TIERS[tier].grass
		var out := TITLE.boosted_grass(row.blades_per_sqm, tier, BOOST, RANGE_BOOST)
		assert_float(out.blades_per_sqm).is_equal_approx(minf(row.blades_per_sqm * BOOST, 600.0), 0.01)
		assert_float(out.blade_range).is_equal_approx(row.blade_range * RANGE_BOOST, 0.01)
		assert_float(out.thin_start).is_equal_approx(row.thin_start * RANGE_BOOST, 0.01)
		assert_float(out.grass_fade_out_end).is_equal_approx(row.grass_fade_out_end * RANGE_BOOST, 0.01)


func test_boost_preserves_the_order_of_the_tiers() -> void:
	var previous := 0.0
	for tier in GFX.TIERS.size():
		var out := TITLE.boosted_grass(GFX.TIERS[tier].grass.blades_per_sqm, tier, BOOST, RANGE_BOOST)
		assert_float(out.blades_per_sqm).is_greater(previous)
		previous = out.blades_per_sqm


func test_boost_clamps_to_what_the_field_accepts() -> void:
	var out := TITLE.boosted_grass(GFX.TIERS[GFX.Tier.EPIC].grass.blades_per_sqm, GFX.Tier.EPIC, BOOST, RANGE_BOOST)
	assert_float(out.blades_per_sqm).is_equal_approx(600.0, 0.01)


func test_custom_density_borrows_the_ranges_of_the_tier_it_resembles() -> void:
	var custom := GFX.PRESET_NAMES.size() - 1
	var potato: Dictionary = GFX.TIERS[GFX.Tier.POTATO].grass
	var out := TITLE.boosted_grass(potato.blades_per_sqm, custom, BOOST, RANGE_BOOST)
	assert_float(out.blade_range).is_equal_approx(potato.blade_range * RANGE_BOOST, 0.01)

	var epic: Dictionary = GFX.TIERS[GFX.Tier.EPIC].grass
	var high := TITLE.boosted_grass(epic.blades_per_sqm, custom, BOOST, RANGE_BOOST)
	assert_float(high.blade_range).is_equal_approx(epic.blade_range * RANGE_BOOST, 0.01)


func test_mobile_gets_no_boost_at_all() -> void:
	var factors: Array = TITLE.boost_factors()
	assert_int(factors.size()).is_equal(2)
	if OS.has_feature("mobile"):
		assert_float(factors[0]).is_equal_approx(1.0, 0.001)
		assert_float(factors[1]).is_equal_approx(1.0, 0.001)
	else:
		assert_float(factors[0]).is_equal_approx(BOOST, 0.001)
		assert_float(factors[1]).is_equal_approx(RANGE_BOOST, 0.001)
