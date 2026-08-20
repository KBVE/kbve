extends GdUnitTestSuite

const ChatPanelScript := preload("res://src/ui/chat_panel.gd")


func _panel() -> ChatPanel:
	var panel: ChatPanel = ChatPanelScript.new()
	add_child(panel)
	await await_idle_frame()
	return panel


func test_the_chat_action_exists_so_the_panel_can_be_opened() -> void:
	assert_bool(InputMap.has_action(&"chat")).is_true()


func test_a_guest_cannot_open_the_entry() -> void:
	Auth.sign_in_as_guest()
	var panel: ChatPanel = await _panel()
	panel.toggle()
	assert_bool(panel.has_focus_grabbed()).is_false()
	panel.queue_free()


func test_the_log_resizes_with_the_viewport() -> void:
	var panel: ChatPanel = await _panel()
	var view := panel.get_viewport().get_visible_rect().size
	var log_node: RichTextLabel = panel.get_node("Root/Column/Log")
	assert_float(log_node.custom_minimum_size.y).is_greater(0.0)
	assert_float(log_node.custom_minimum_size.y).is_less(view.y)
	assert_float(log_node.custom_minimum_size.x).is_less_equal(view.x)
	panel.queue_free()


func test_the_log_does_not_swallow_the_screen() -> void:
	var panel: ChatPanel = await _panel()
	await await_idle_frame()
	var view := panel.get_viewport().get_visible_rect().size
	var column: VBoxContainer = panel.get_node("Root/Column")
	var log_node: RichTextLabel = panel.get_node("Root/Column/Log")
	assert_float(log_node.size.y).override_failure_message(
			"log is %s tall of %s" % [log_node.size.y, view.y]).is_less(view.y * 0.6)
	if view.x / maxf(view.y, 1.0) > ChatPanel.WIDE_ASPECT:
		assert_float(column.size.x).override_failure_message(
				"column is %s wide of %s" % [column.size.x, view.x]).is_less(view.x * 0.6)
	panel.queue_free()


func test_an_empty_submit_is_not_reported_as_a_failure() -> void:
	Auth.sign_in_as_guest()
	var panel: ChatPanel = await _panel()
	var log_node: RichTextLabel = panel.get_node("Root/Column/Log")
	panel._on_submit("")
	panel._on_submit("   ")
	await await_idle_frame()
	assert_str(log_node.get_parsed_text()).override_failure_message(
			"an empty submit claimed the message was not sent").is_empty()
	panel.queue_free()


func test_the_world_knows_when_someone_is_typing() -> void:
	var panel: ChatPanel = await _panel()
	assert_bool(ChatPanel.anyone_typing(get_tree())).override_failure_message(
			"a closed chat box should not block movement").is_false()
	panel._open = true
	assert_bool(ChatPanel.anyone_typing(get_tree())).override_failure_message(
			"typing must be visible to whatever polls Input directly").is_true()
	panel._open = false
	panel.queue_free()


func test_every_chat_string_is_translated() -> void:
	for key in ["chat.signin_required", "chat.reconnecting", "chat.send_failed"]:
		assert_str(I18n.t(key)).override_failure_message(
				"%s has no translation" % key).is_not_equal(key)


func test_every_failure_reason_is_translated() -> void:
	for key in ["chat.signin_required", "chat.unreachable", "chat.unavailable",
			"chat.reconnecting", "chat.send_failed"]:
		assert_str(I18n.t(key)).override_failure_message(
				"%s has no translation" % key).is_not_equal(key)




func test_the_chat_client_is_the_one_the_extension_provides() -> void:
	var client: Object = ClassDB.instantiate(&"QChatClient")
	for method in [&"start", &"stop", &"send_chat", &"is_connected_to_chat"]:
		assert_bool(client.has_method(method)).override_failure_message(
				"QChatClient cannot %s" % method).is_true()
	for sig in [&"message", &"state_changed", &"failed"]:
		assert_bool(client.has_signal(sig)).override_failure_message(
				"QChatClient never reports %s" % sig).is_true()
	assert_bool(client.send_chat("hello")).override_failure_message(
			"a client with no session cannot have sent anything").is_false()
	client.free()


func test_the_panel_builds_the_extension_client() -> void:
	Auth.sign_in_as_guest()
	var panel: ChatPanel = await _panel()
	var client := panel.get_node_or_null(^"ChatClient")
	assert_object(client).override_failure_message(
			"the panel did not stand up a chat client").is_not_null()
	assert_str(client.get_class()).is_equal("QChatClient")
	panel.queue_free()


func test_a_relayed_line_says_where_it_came_from() -> void:
	var panel: ChatPanel = await _panel()
	var log_node: RichTextLabel = panel.get_node("Root/Column/Log")
	panel._append("chat", "discordsh-bot", "<alice> hey")
	panel._append("chat", "someplayer", "hey back")
	await await_idle_frame()
	var text := log_node.get_parsed_text()
	assert_str(text).override_failure_message(
			"a relayed line did not name its source: %s" % text).contains("[Discord]")
	assert_str(text).override_failure_message(
			"the bot nick should not be shown as the speaker").not_contains("discordsh-bot")
	assert_str(text).override_failure_message(
			"a player line should still name the player").contains("someplayer")
	panel.queue_free()
