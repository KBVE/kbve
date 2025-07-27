class_name SettingsManager
extends Object

## Static helper class to open settings from anywhere
## Usage: SettingsManager.open_settings(self)

static func open_settings(parent_node: Node) -> Control:
	"""
	Opens the settings menu and adds it to the specified parent node.
	Returns the settings menu instance.
	
	Example usage:
		SettingsManager.open_settings(self)
		SettingsManager.open_settings(get_tree().current_scene)
	"""
	if not parent_node:
		push_error("SettingsManager: Parent node is null")
		return null
	
	# Load the enhanced settings menu scene
	var settings_scene = load("res://scenes/ui/settings/enhanced_settings_menu.tscn")
	if not settings_scene:
		push_error("SettingsManager: Could not load settings menu scene")
		return null
	
	# Instantiate the settings menu
	var settings_menu = settings_scene.instantiate()
	
	# Always create a new dedicated CanvasLayer for settings to ensure proper input handling
	var ui_layer = CanvasLayer.new()
	ui_layer.name = "SettingsLayer_" + str(randi())  # Unique name to avoid conflicts
	ui_layer.layer = 100  # Very high layer for settings
	ui_layer.process_mode = Node.PROCESS_MODE_WHEN_PAUSED
	
	# Add to the scene tree root to ensure it's above everything
	parent_node.get_tree().root.add_child(ui_layer)
	print("SettingsManager: Created new SettingsLayer with unique name")
	
	# Add the settings menu to the canvas layer
	ui_layer.add_child(settings_menu)
	
	# Ensure the settings menu is cleaned up properly
	settings_menu.tree_exiting.connect(func(): ui_layer.queue_free())
	
	print("SettingsManager: Added settings menu to dedicated layer")
	
	return settings_menu

static func open_settings_with_callback(parent_node: Node, callback: Callable) -> Control:
	"""
	Opens the settings menu and connects a callback to the settings_closed signal.
	
	Example usage:
		SettingsManager.open_settings_with_callback(self, _on_settings_closed)
	"""
	var settings_menu = open_settings(parent_node)
	
	if settings_menu and settings_menu.has_signal("settings_closed"):
		settings_menu.settings_closed.connect(callback, CONNECT_ONE_SHOT)
	
	return settings_menu
