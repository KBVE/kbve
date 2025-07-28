extends Control

@onready var play_button = $MenuContainer/MenuButtons/PlayButton
@onready var continue_button = $MenuContainer/MenuButtons/ContinueButton
@onready var settings_button = $MenuContainer/MenuButtons/SettingsButton
@onready var credits_button = $MenuContainer/MenuButtons/CreditsButton
@onready var quit_button = $MenuContainer/MenuButtons/QuitButton

signal menu_action(action: String, data: Dictionary)

func _ready():
	print_node_tree(self, 0)
	if play_button:
		print("Connecting play button: ", play_button)
		print("Play button disabled: ", play_button.disabled)
		play_button.pressed.connect(func(): print("PLAY BUTTON CLICKED"); _on_play_pressed())
	else:
		print("ERROR: play_button not found!")
	if continue_button:
		print("Connecting continue button: ", continue_button)
		continue_button.pressed.connect(func(): print("CONTINUE BUTTON CLICKED"); _on_continue_pressed())
	if settings_button:
		print("Connecting settings button: ", settings_button)
		settings_button.pressed.connect(func(): print("SETTINGS BUTTON CLICKED"); _on_settings_pressed())
	if credits_button:
		print("Connecting credits button: ", credits_button)
		credits_button.pressed.connect(func(): print("CREDITS BUTTON CLICKED"); _on_credits_pressed())
	if quit_button:
		print("Connecting quit button: ", quit_button)
		quit_button.pressed.connect(func(): print("QUIT BUTTON CLICKED"); _on_quit_pressed())
	print("TitleMenu connections complete")

func print_node_tree(node: Node, depth: int):
	var indent = "  ".repeat(depth)
	print(indent + node.name + " (" + node.get_class() + ")")
	for child in node.get_children():
		print_node_tree(child, depth + 1)

func _input(event):
	if event is InputEventMouseButton and event.pressed:
		print("TitleMenu detected mouse click at: ", event.position)

func _on_play_pressed():
	print("Play button pressed!")
	print("Emitting menu_action signal with 'play'")
	menu_action.emit("play", {})
	print("Signal emitted")

func _on_continue_pressed():
	print("Continue button pressed!")
	menu_action.emit("continue", {})

func _on_settings_pressed():
	print("Settings button pressed!")
	menu_action.emit("settings", {})

func _on_credits_pressed():
	menu_action.emit("credits", {})

func _on_quit_pressed():
	menu_action.emit("quit", {})

func update_for_save_state(has_save: bool, player_data: Dictionary = {}):
	"""Update menu buttons based on save state"""
	if has_save and not player_data.is_empty():
		# We have a save file
		if play_button:
			play_button.text = "New Game"
		if continue_button:
			var player_name = player_data.get("player_name", "Unknown Captain")
			continue_button.text = "Continue as " + player_name
			continue_button.visible = true
	else:
		# No save file
		if play_button:
			play_button.text = "Start Adventure"
		if continue_button:
			continue_button.visible = false
