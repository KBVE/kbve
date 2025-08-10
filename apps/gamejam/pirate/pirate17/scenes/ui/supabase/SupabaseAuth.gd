extends Control

signal auth_state_changed(user)
signal auth_error(error_message)
signal close_requested

@onready var discord_button: Button = $VBoxContainer/DiscordButton
@onready var guest_button: Button = $VBoxContainer/GuestButton
@onready var status_label: Label = $VBoxContainer/StatusLabel
@onready var user_info: Label = $VBoxContainer/UserInfo
@onready var close_button: Button = $AuthPanel/CloseButton

var current_user = null
var is_in_iframe = false

func _ready():
	discord_button.pressed.connect(_on_discord_login)
	guest_button.pressed.connect(_on_guest_login)
	close_button.pressed.connect(_on_close_pressed)
	
	# Check if Supabase is available first
	_check_supabase_availability()

func _check_supabase_availability():
	status_label.text = "Checking Supabase availability..."
	
	var js_code = """
	if (typeof window.sb !== 'undefined' && window.sb && window.sb.auth) {
		window.supabaseAvailable = true;
		console.log('Supabase is available');
	} else {
		window.supabaseAvailable = false;
		console.log('Supabase is not available');
	}
	"""
	JavaScriptBridge.eval(js_code)
	
	# Wait a moment then check result
	await get_tree().create_timer(0.5).timeout
	
	var is_available = JavaScriptBridge.eval("window.supabaseAvailable", true)
	
	if is_available:
		print("Supabase is available, proceeding with auth setup")
		_initialize_supabase_auth()
	else:
		print("Supabase not available, showing guest-only mode")
		_show_guest_only_mode()

func _initialize_supabase_auth():
	# Check if we're in an iframe (like itch.io)
	_check_iframe_status()
	
	# Check for existing session
	_check_existing_session()
	
	# Listen for auth state changes
	_setup_auth_listeners()

func _show_guest_only_mode():
	status_label.text = "Authentication unavailable - Guest mode only"
	discord_button.hide()
	guest_button.text = "Continue as Guest"

func _check_iframe_status():
	var js_code = """
	try {
		window.isInIframe = (window.parent !== window);
		console.log('Is in iframe:', window.isInIframe);
	} catch(e) {
		window.isInIframe = true;
		console.log('Iframe check failed, assuming iframe');
	}
	"""
	JavaScriptBridge.eval(js_code)
	
	# Get the result
	var iframe_check = JavaScriptBridge.eval("window.isInIframe", true)
	is_in_iframe = iframe_check if iframe_check != null else false
	
	print("Running in iframe: ", is_in_iframe)
	_update_ui_for_environment()

func _update_ui_for_environment():
	if is_in_iframe:
		status_label.text = "Authentication available (Popup mode)"
		discord_button.text = "Login with Discord (Popup)"
	else:
		status_label.text = "Authentication available"
		discord_button.text = "Login with Discord"

func _setup_auth_listeners():
	var js_code = """
	window.sb.auth.onAuthStateChange((event, session) => {
		console.log('Auth state changed:', event, session);
		if (session && session.user) {
			window.currentUser = session.user;
			window.authEvent = 'signed_in';
		} else {
			window.currentUser = null;
			window.authEvent = 'signed_out';
		}
	});
	"""
	JavaScriptBridge.eval(js_code)

func _check_existing_session():
	status_label.text = "Checking for existing session..."
	
	var js_code = """
	async function checkSession() {
		try {
			const { data: { session } } = await window.sb.auth.getSession();
			
			if (session) {
				const { data: { user } } = await window.sb.auth.getUser();
				console.log('User:', user);
				window.currentUser = user;
				window.authEvent = 'signed_in';
				window.hasExistingSession = true;
				console.log('Existing session found:', user);
			} else {
				console.log('No session, probably not logged in.');
				window.currentUser = null;
				window.authEvent = 'signed_out';
				window.hasExistingSession = false;
			}
		} catch (error) {
			console.error('Error checking session:', error);
			window.currentUser = null;
			window.authEvent = 'signed_out';
			window.hasExistingSession = false;
		}
	}
	
	checkSession();
	"""
	JavaScriptBridge.eval(js_code)
	
	# Check periodically for auth state changes
	var timer = Timer.new()
	timer.wait_time = 0.5
	timer.timeout.connect(_poll_auth_state)
	add_child(timer)
	timer.start()

func _poll_auth_state():
	var auth_event = JavaScriptBridge.eval("window.authEvent", true)
	var user_data = JavaScriptBridge.eval("window.currentUser", true)
	
	if auth_event == "signed_in" and user_data != null and current_user == null:
		print("Processing auth event: signed_in with user data")
		current_user = user_data
		_on_auth_success(user_data)
		# Clear the event
		JavaScriptBridge.eval("window.authEvent = null")
	elif auth_event == "signed_out" and current_user != null:
		print("Processing auth event: signed_out")
		current_user = null
		_on_auth_signout()
		# Clear the event
		JavaScriptBridge.eval("window.authEvent = null")
	
	# Also check if we have an existing session that wasn't processed
	if current_user == null and user_data != null:
		var has_session = JavaScriptBridge.eval("window.hasExistingSession", true)
		if has_session:
			print("Processing existing session with user data")
			current_user = user_data
			_on_auth_success(user_data)
			JavaScriptBridge.eval("window.hasExistingSession = false")

func _on_discord_login():
	status_label.text = "Connecting to Discord..."
	discord_button.disabled = true
	
	var js_code = ""
	if is_in_iframe:
		# For iframe (itch.io), use popup mode
		js_code = """
		window.sb.auth.signInWithOAuth({
			provider: 'discord',
			options: {
				redirectTo: window.location.origin + window.location.pathname,
				skipBrowserRedirect: true
			}
		}).then(({data, error}) => {
			if (error) {
				console.error('Discord auth error:', error);
				window.authError = error.message;
			} else {
				console.log('Discord auth initiated');
			}
		});
		"""
	else:
		# For non-iframe, use normal redirect
		js_code = """
		window.sb.auth.signInWithOAuth({
			provider: 'discord',
			options: {
				redirectTo: window.location.href
			}
		}).then(({data, error}) => {
			if (error) {
				console.error('Discord auth error:', error);
				window.authError = error.message;
			}
		});
		"""
	
	JavaScriptBridge.eval(js_code)
	
	# Check for errors
	await get_tree().create_timer(1.0).timeout
	var error = JavaScriptBridge.eval("window.authError", true)
	if error != null:
		_on_auth_error(str(error))
		JavaScriptBridge.eval("window.authError = null")

func _on_guest_login():
	status_label.text = "Continuing as guest..."
	guest_button.disabled = true
	
	# Create a guest session
	var timestamp = Time.get_unix_time_from_system()
	var random_id = randi() % 100000
	current_user = {
		"id": "guest_" + str(timestamp) + "_" + str(random_id),
		"email": "guest@pirate-game.local",
		"user_metadata": {
			"full_name": "Guest Player",
			"avatar_url": ""
		},
		"is_guest": true
	}
	
	_on_auth_success(current_user)

func _on_auth_success(user_data):
	current_user = user_data
	
	var display_name = "Unknown"
	if user_data.has("user_metadata") and user_data.user_metadata.has("full_name"):
		display_name = user_data.user_metadata.full_name
	elif user_data.has("email"):
		display_name = user_data.email
	
	user_info.text = "Welcome, " + display_name + "!"
	
	# Only hide buttons for non-guest users
	if user_data.get("is_guest", false):
		status_label.text = "Guest mode - You can still sign in with Discord"
		guest_button.hide()
		discord_button.show()
		discord_button.disabled = false
		discord_button.text = "Upgrade to Discord Account"
	else:
		status_label.text = "Authenticated successfully"
		discord_button.hide()
		guest_button.hide()
	
	auth_state_changed.emit(user_data)
	print("Authentication successful: ", display_name)

func _on_auth_signout():
	current_user = null
	user_info.text = ""
	status_label.text = "Signed out"
	
	discord_button.show()
	discord_button.disabled = false
	guest_button.show()
	guest_button.disabled = false
	
	auth_state_changed.emit(null)
	print("User signed out")

func _on_auth_error(error_message: String):
	status_label.text = "Authentication failed: " + error_message
	discord_button.disabled = false
	guest_button.disabled = false
	
	auth_error.emit(error_message)
	print("Authentication error: ", error_message)

func sign_out():
	if current_user and not current_user.get("is_guest", false):
		JavaScriptBridge.eval("window.sb.auth.signOut()")
	else:
		_on_auth_signout()

func get_current_user():
	return current_user

func is_authenticated() -> bool:
	return current_user != null

func _on_close_pressed():
	close_requested.emit()