extends GdUnitTestSuite


const SignIn := preload("res://src/ui/sign_in_panel.gd")


func test_every_offered_provider_is_branded() -> void:
	for provider: String in AuthSession.PROVIDERS:
		assert_bool(SignIn.PROVIDER_BRAND.has(provider)) \
			.override_failure_message("'%s' is offered with no brand" % provider) \
			.is_true()
		var brand: Dictionary = SignIn.PROVIDER_BRAND[provider]
		for key in ["name", "tint", "icon"]:
			assert_bool(brand.has(key)) \
				.override_failure_message("'%s' brand is missing %s" % [provider, key]) \
				.is_true()


func test_every_provider_mark_exists() -> void:
	for provider: String in SignIn.PROVIDER_BRAND:
		var path: String = SignIn.PROVIDER_BRAND[provider]["icon"]
		assert_bool(ResourceLoader.exists(path)) \
			.override_failure_message("%s has no mark at %s" % [provider, path]) \
			.is_true()
		assert_object(load(path) as Texture2D) \
			.override_failure_message("%s did not load as a texture" % path) \
			.is_not_null()


func test_no_two_providers_share_a_colour() -> void:
	var seen := {}
	for provider: String in SignIn.PROVIDER_BRAND:
		var tint: Color = SignIn.PROVIDER_BRAND[provider]["tint"]
		assert_bool(seen.has(tint.to_html())) \
			.override_failure_message("%s wears a colour another provider already has" % provider) \
			.is_false()
		seen[tint.to_html()] = provider


func test_twitch_is_offered() -> void:
	assert_array(AuthSession.PROVIDERS).contains(["twitch"])


func test_the_panel_builds_a_button_for_every_provider() -> void:
	var panel: SignInPanel = SignIn.new()
	add_child(panel)
	await get_tree().process_frame
	for provider: String in AuthSession.PROVIDERS:
		assert_bool(panel.provider_buttons.has(provider)) \
			.override_failure_message("no button for '%s'" % provider).is_true()
		assert_object(panel.provider_buttons[provider].icon) \
			.override_failure_message("'%s' button has no mark on it" % provider).is_not_null()
	panel.queue_free()


func test_a_sign_in_in_flight_locks_every_provider() -> void:
	var panel: SignInPanel = SignIn.new()
	add_child(panel)
	await get_tree().process_frame
	panel.set_busy(true)
	for provider: String in panel.provider_buttons:
		assert_bool(panel.provider_buttons[provider].disabled) \
			.override_failure_message("'%s' was still pressable" % provider).is_true()
	panel.queue_free()


## The buttons carried no tooltip text, and PaperButton builds a custom tooltip
## whichever way it is asked -- so hovering Discord, Twitch or GitHub popped an
## empty panel instead of saying what the button does.
func test_every_provider_button_says_what_it_does() -> void:
	var panel: Node = SignIn.new()
	add_child(panel)
	await await_idle_frame()
	assert_int(panel.provider_buttons.size()).is_greater(0)
	for provider: String in panel.provider_buttons:
		var button: Control = panel.provider_buttons[provider]
		var tip := button.tooltip_text
		assert_str(tip).override_failure_message(
				"'%s' hovers with an empty tooltip" % provider).is_not_empty()
		assert_str(tip).override_failure_message(
				"'%s' tooltip left a placeholder unfilled: %s" % [provider, tip]) \
				.not_contains("{")
		var brand: Dictionary = SignIn.PROVIDER_BRAND[provider]
		assert_str(tip).override_failure_message(
				"'%s' tooltip never names the provider: %s" % [provider, tip]) \
				.contains(str(brand["name"]))
	panel.queue_free()


## A StyleBoxFlat shadow is drawn outside the box it belongs to, and the tooltip
## window is sized to the control's minimum size, which does not count it. Without
## room reserved the shadow ran into the window edge and was clipped at the sides.
func test_a_tooltip_leaves_room_for_its_own_shadow() -> void:
	var MenuStyle := preload("res://src/ui/components/menu_style.gd")
	var tip: Control = MenuStyle.tooltip("Sign in using your Discord account.", 1.0)
	add_child(tip)
	await await_idle_frame()

	var shadow: int = MenuStyle.TOOLTIP_SHADOW
	for side in ["left", "right", "top", "bottom"]:
		assert_int(tip.get_theme_constant("margin_" + side)).override_failure_message(
				"nothing reserved on the %s for a %spx shadow" % [side, shadow]) \
				.is_greater_equal(shadow)

	var plate: Control = tip.get_child(0)
	assert_object(plate).is_not_null()
	assert_float(plate.size.x).override_failure_message(
			"the plate is as wide as the window, so the shadow has nowhere to go") \
			.is_less(tip.size.x)
	assert_float(plate.size.y).is_less(tip.size.y)
	tip.queue_free()

