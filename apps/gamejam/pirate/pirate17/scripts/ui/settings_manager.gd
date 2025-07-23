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
	
	# Load the settings menu scene
	var settings_scene = load("res://scenes/ui/settings_menu.tscn")
	if not settings_scene:
		push_error("SettingsManager: Could not load settings menu scene")
		return null
	
	# Instantiate the settings menu
	var settings_menu = settings_scene.instantiate()
	
	# Always use a CanvasLayer for proper layering
	var ui_layer = parent_node.get_node_or_null("SettingsLayer")
	if not ui_layer:
		# Try to find existing UI layer
		ui_layer = parent_node.get_node_or_null("UI")
		if not ui_layer or not ui_layer is CanvasLayer:
			# Create dedicated settings layer with very high priority
			ui_layer = CanvasLayer.new()
			ui_layer.name = "SettingsLayer"
			ui_layer.layer = 100  # Very high layer for settings
			parent_node.add_child(ui_layer)
	parent_node = ui_layer
	
	# Add the settings menu to the parent
	parent_node.add_child(settings_menu)
	
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