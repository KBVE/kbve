extends Control

@onready var play_button = $MenuContainer/MenuButtons/PlayButton
@onready var continue_button = $MenuContainer/MenuButtons/ContinueButton
@onready var account_button = $MenuContainer/MenuButtons/AccountButton
@onready var settings_button = $MenuContainer/MenuButtons/SettingsButton
@onready var credits_button = $MenuContainer/MenuButtons/CreditsButton
@onready var quit_button = $MenuContainer/MenuButtons/QuitButton

@onready var auth_popup = $AuthPopup
@onready var auth_scene = $AuthPopup/SupabaseAuth

signal menu_action(action: String, data: Dictionary)

var current_user = null

func _ready():
	if play_button:
		play_button.pressed.connect(_on_play_pressed)
	if continue_button:
		continue_button.pressed.connect(_on_continue_pressed)
	if account_button:
		account_button.pressed.connect(_on_account_pressed)
	if settings_button:
		settings_button.pressed.connect(_on_settings_pressed)
	if credits_button:
		credits_button.pressed.connect(_on_credits_pressed)
	if quit_button:
		quit_button.pressed.connect(_on_quit_pressed)
	
	# Setup auth system
	if auth_scene:
		auth_scene.auth_state_changed.connect(_on_auth_state_changed)
		auth_scene.auth_error.connect(_on_auth_error)
		auth_scene.close_requested.connect(_on_auth_close_requested)
	
	# Close popup when clicking outside
	if auth_popup:
		auth_popup.gui_input.connect(_on_auth_popup_input)



func play_confirm_sfx():
	var music_player = get_node_or_null("/root/MusicPlayerAutoload")
	if music_player:
		music_player.play_sfx("confirm")

func _on_play_pressed():
	play_confirm_sfx()
	menu_action.emit("play", {})

func _on_continue_pressed():
	play_confirm_sfx()
	menu_action.emit("continue", {"user": current_user})

func _on_account_pressed():
	play_confirm_sfx()
	if auth_popup:
		auth_popup.visible = true

func _on_settings_pressed():
	play_confirm_sfx()
	menu_action.emit("settings", {})

func _on_credits_pressed():
	play_confirm_sfx()
	menu_action.emit("credits", {})

func _on_quit_pressed():
	play_confirm_sfx()
	menu_action.emit("quit", {})

func update_for_save_state(has_save: bool, player_data: Dictionary = {}):
	if has_save and not player_data.is_empty():
		if play_button:
			play_button.text = "New Game"
		if continue_button:
			var player_name = player_data.get("player_name", "Unknown Captain")
			continue_button.text = "Continue as " + player_name
			continue_button.visible = true
	else:
		if play_button:
			play_button.text = "Start Adventure"
		if continue_button:
			continue_button.visible = false

func _on_auth_state_changed(user):
	current_user = user
	_update_account_button()
	
	# Close auth popup when authenticated
	if user and auth_popup:
		auth_popup.visible = false

func _on_auth_error(error_message: String):
	print("Authentication error: ", error_message)
	# Could show a toast notification here

func _update_account_button():
	if not account_button:
		return
		
	if current_user:
		var display_name = "Account"
		if current_user.has("user_metadata") and current_user.user_metadata.has("full_name"):
			display_name = current_user.user_metadata.full_name
		elif current_user.has("email"):
			display_name = current_user.email.split("@")[0]
		elif current_user.get("is_guest", false):
			display_name = "Guest"
		
		account_button.text = display_name
		account_button.modulate = Color(0.8, 1.0, 0.8, 1.0)  # Light green tint when authenticated
	else:
		account_button.text = "Account"
		account_button.modulate = Color.WHITE

func _on_auth_close_requested():
	if auth_popup:
		auth_popup.visible = false

func _on_auth_popup_input(event):
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# Check if click was outside the auth scene area
		var auth_rect = auth_scene.get_rect()
		var global_pos = auth_scene.global_position
		var full_rect = Rect2(global_pos, auth_rect.size)
		
		if not full_rect.has_point(event.global_position):
			auth_popup.visible = false
