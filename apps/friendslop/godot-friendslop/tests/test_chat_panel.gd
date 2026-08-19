extends GdUnitTestSuite

const ChatPanelScript := preload("res://src/ui/chat_panel.gd")
const ChatClientScript := preload("res://src/net/chat_client.gd")


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


func test_the_client_reports_signin_required_without_an_account() -> void:
	Auth.sign_in_as_guest()
	var client: ChatClient = ChatClientScript.new()
	add_child(client)
	await await_idle_frame()
	var reasons: Array[String] = []
	client.failed.connect(func(reason: String) -> void: reasons.append(reason))
	client.start()
	await await_idle_frame()
	assert_array(reasons).contains(["chat.signin_required"])
	assert_bool(client.is_connected_to_chat()).is_false()
	client.queue_free()


func test_the_log_resizes_with_the_viewport() -> void:
	var panel: ChatPanel = await _panel()
	var view := panel.get_viewport().get_visible_rect().size
	var log_node: RichTextLabel = panel.get_node("Root/Column/Log")
	assert_float(log_node.custom_minimum_size.y).is_greater(0.0)
	assert_float(log_node.custom_minimum_size.y).is_less(view.y)
	assert_float(log_node.custom_minimum_size.x).is_less_equal(view.x)
	panel.queue_free()


## The minimum size was always right; the size the panel actually took was the
## whole screen, because the log expanded into every pixel the column owned.
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


func test_every_chat_string_is_translated() -> void:
	for key in ["chat.signin_required", "chat.reconnecting", "chat.send_failed"]:
		assert_str(I18n.t(key)).override_failure_message(
				"%s has no translation" % key).is_not_equal(key)


func test_send_is_refused_while_disconnected() -> void:
	var client: ChatClient = ChatClientScript.new()
	add_child(client)
	await await_idle_frame()
	assert_bool(client.send_chat("hello")).is_false()
	client.queue_free()


func test_every_failure_reason_is_translated() -> void:
	for key in ["chat.signin_required", "chat.unreachable", "chat.unavailable",
			"chat.reconnecting", "chat.send_failed"]:
		assert_str(I18n.t(key)).override_failure_message(
				"%s has no translation" % key).is_not_equal(key)


func test_the_client_gives_up_on_a_refused_handshake() -> void:
	var client: ChatClient = ChatClientScript.new()
	assert_int(client.MAX_HANDSHAKE_FAILURES).is_greater(0)
	client.free()
