class_name DialogueSettingsManager
extends Object

## Static helper class to open dialogue-based settings
## This is used when you want settings integrated with the dialogue system

static func open_dialogue_settings(parent_node: Node) -> Control:
	"""
	Opens the dialogue-based settings menu.
	Requires DialogueSystem to be available as an autoload.
	"""
	if not parent_node:
		push_error("DialogueSettingsManager: Parent node is null")
		return null
	
	# Check if DialogueSystem exists
	var dialogue_system = parent_node.get_node_or_null("/root/DialogueSystem")
	if not dialogue_system:
		push_error("DialogueSettingsManager: DialogueSystem not found - use regular settings instead")
		return null
	
	# Load the dialogue settings scene
	var dialogue_settings_scene = load("res://scenes/ui/settings/dialogue_settings.tscn")
	if not dialogue_settings_scene:
		# Fallback to regular settings
		push_warning("DialogueSettingsManager: Could not load dialogue settings, using regular settings")
		return SettingsManager.open_settings(parent_node)
	
	# Create the settings instance
	var dialogue_settings = dialogue_settings_scene.instantiate()
	
	# Use CanvasLayer for proper layering
	var ui_layer = parent_node.get_node_or_null("DialogueLayer")
	if not ui_layer:
		ui_layer = CanvasLayer.new()
		ui_layer.name = "DialogueLayer"
		ui_layer.layer = 100
		ui_layer.process_mode = Node.PROCESS_MODE_WHEN_PAUSED
		parent_node.add_child(ui_layer)
	
	ui_layer.add_child(dialogue_settings)
	return dialogue_settings

static func open_dialogue_settings_with_callback(parent_node: Node, callback: Callable) -> Control:
	"""
	Opens dialogue settings and connects a callback.
	"""
	var dialogue_settings = open_dialogue_settings(parent_node)
	
	if dialogue_settings and dialogue_settings.has_signal("dialogue_settings_closed"):
		dialogue_settings.dialogue_settings_closed.connect(callback, CONNECT_ONE_SHOT)
	
	return dialogue_settings