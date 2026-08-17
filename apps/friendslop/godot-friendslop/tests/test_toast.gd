extends GdUnitTestSuite

const TitleScreen := preload("res://src/title_screen.gd")

var _was: Dictionary = {}


func before_test() -> void:
	_was = Journal.satchel()
	Journal.forget_everything()
	Toast.clear()


func after_test() -> void:
	Toast.clear()
	Journal.forget_everything()
	for ref: StringName in _was:
		Journal.gain(ref, int(_was[ref]))
	Journal.save_now()


func test_something_arriving_is_said() -> void:
	Journal.gain(&"log", 2)

	var lines := Toast.lines()
	assert_int(lines.size()).is_equal(1)
	assert_str(str(lines[0]["text"])) \
			.override_failure_message("the notice did not say how many arrived").contains("2")
	assert_str(str(lines[0]["text"])).contains(Itemdb.display_name(&"log"))


func test_a_full_bag_says_so_and_says_it_differently() -> void:
	var cap := Itemdb.max_stack(&"log")
	var cells := Journal.COLS * Journal.ROWS
	Journal.gain(&"log", cap * cells + 3)

	var warned: Array = Toast.lines().filter(
			func(l: Dictionary) -> bool: return int(l["kind"]) == Toast.Kind.WARN)
	assert_int(warned.size()) \
			.override_failure_message("a bag too full to take the loot said nothing about it") \
			.is_equal(1)
	assert_str(str(warned[0]["text"])).contains("3")


func test_the_same_thing_twice_is_one_line_that_counts() -> void:
	Journal.gain(&"log", 1)
	Journal.gain(&"log", 1)

	var lines := Toast.lines()
	assert_int(lines.size()) \
			.override_failure_message("two identical notices stacked up instead of merging") \
			.is_equal(1)
	assert_int(int(lines[0]["times"])).is_equal(2)


func test_different_things_get_their_own_line() -> void:
	Journal.gain(&"log", 1)
	Journal.gain(&"stone", 1)
	assert_int(Toast.lines().size()).is_equal(2)


func test_an_empty_notice_is_not_a_notice() -> void:
	Toast.show_toast("")
	Toast.show_toast("   ")
	assert_int(Toast.lines().size()).is_equal(0)


func test_only_so_many_are_shown_and_the_newest_survives() -> void:
	for i in Toast.MAX_SHOWN + 2:
		Toast.info("notice %d" % i)

	var lines := Toast.lines()
	assert_int(lines.size()).is_equal(Toast.MAX_SHOWN)
	assert_str(str(lines[lines.size() - 1]["text"])) \
			.override_failure_message("the newest notice was the one dropped") \
			.is_equal("notice %d" % (Toast.MAX_SHOWN + 1))


func test_a_notice_goes_away_on_its_own() -> void:
	Toast.show_toast("something happened", Toast.Kind.INFO, 0.2)
	assert_int(Toast.lines().size()).is_equal(1)

	await get_tree().create_timer(0.2 + Toast.RISE + Toast.FADE + 0.2).timeout
	assert_int(Toast.lines().size()) \
			.override_failure_message("the notice stayed on screen for ever").is_equal(0)


func test_a_repeat_puts_the_clock_back() -> void:
	Toast.show_toast("something happened", Toast.Kind.INFO, 0.3)
	await get_tree().create_timer(0.25).timeout
	Toast.show_toast("something happened", Toast.Kind.INFO, 0.3)
	await get_tree().create_timer(0.2).timeout

	assert_int(Toast.lines().size()) \
			.override_failure_message("a refreshed notice expired on the old clock").is_equal(1)


func test_there_is_only_one_place_notices_are_drawn() -> void:
	var found: Array[String] = []
	for path in ["res://src/ui/toast.gd", "res://src/autoload/toast.gd"]:
		if ResourceLoader.exists(path):
			found.append(path)
	assert_array(found) \
			.override_failure_message("more than one toast implementation is in the project") \
			.is_equal(["res://src/autoload/toast.gd"])


func test_the_greeting_fits_who_is_there() -> void:
	assert_str(TitleScreen.greeting_key("", true)).is_equal("title.welcome")
	assert_str(TitleScreen.greeting_key("   ", false)) \
			.override_failure_message("a blank name was greeted as though it were somebody") \
			.is_equal("title.welcome")
	assert_str(TitleScreen.greeting_key("h0lybyte", true)).is_equal("title.welcome_back")
	assert_str(TitleScreen.greeting_key("h0lybyte", false)).is_equal("title.welcome_named")


func test_the_greetings_are_written_and_use_the_name() -> void:
	for key in ["title.welcome", "title.welcome_back", "title.welcome_named"]:
		assert_str(I18n.t(key)) \
				.override_failure_message("%s has nothing written for it" % key) \
				.is_not_equal(key)
	for key in ["title.welcome_back", "title.welcome_named"]:
		assert_str(I18n.t(key, {"name": "h0lybyte"})) \
				.override_failure_message("%s never used the name it was given" % key) \
				.contains("h0lybyte")
