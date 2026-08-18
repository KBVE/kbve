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
