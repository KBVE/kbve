@tool
extends Control

const CONFIG_PATH = "res://addons/web_cdn_integrator/cdn_config.json"

var config_data = {}
var pending_downloads = 0
var status_label: Label
var download_button: Button
var refresh_button: Button
var library_list: VBoxContainer
var http_requests = []

func _init():
	name = "CDN Integrator"

func _ready():
	_setup_ui()
	_load_config()
	_update_library_list()

func _setup_ui():
	set_custom_minimum_size(Vector2(200, 300))
	
	var vbox = VBoxContainer.new()
	add_child(vbox)
	
	# Title
	var title = Label.new()
	title.text = "Web CDN Integrator"
	title.add_theme_font_size_override("font_size", 16)
	vbox.add_child(title)
	
	vbox.add_child(HSeparator.new())
	
	# Status
	status_label = Label.new()
	status_label.text = "Ready"
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(status_label)
	
	# Buttons
	var button_container = HBoxContainer.new()
	vbox.add_child(button_container)
	
	download_button = Button.new()
	download_button.text = "Download All"
	download_button.pressed.connect(_download_all_libraries)
	button_container.add_child(download_button)
	
	refresh_button = Button.new()
	refresh_button.text = "Refresh"
	refresh_button.pressed.connect(_refresh_config)
	button_container.add_child(refresh_button)
	
	vbox.add_child(HSeparator.new())
	
	# Generate Shell button
	var generate_button = Button.new()
	generate_button.text = "Generate shell.html"
	generate_button.pressed.connect(_generate_shell_html)
	vbox.add_child(generate_button)
	
	vbox.add_child(HSeparator.new())
	
	# Library list scroll
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(scroll)
	
	library_list = VBoxContainer.new()
	scroll.add_child(library_list)

func _load_config():
	var file = FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if not file:
		_update_status("Error: Could not open cdn_config.json")
		return
	
	var json_string = file.get_as_text()
	file.close()
	
	var json = JSON.new()
	var parse_result = json.parse(json_string)
	if parse_result != OK:
		_update_status("Error: Failed to parse cdn_config.json")
		return
	
	config_data = json.data
	_update_status("Loaded configuration for: " + str(config_data.keys()))

func _update_library_list():
	# Clear existing children
	for child in library_list.get_children():
		child.queue_free()
	
	for lib_name in config_data:
		var lib_config = config_data[lib_name]
		var is_enabled = lib_config.get("enabled", false)
		
		var lib_container = HBoxContainer.new()
		library_list.add_child(lib_container)
		
		# Checkbox for enable/disable
		var checkbox = CheckBox.new()
		checkbox.button_pressed = is_enabled
		checkbox.text = lib_name.capitalize()
		checkbox.toggled.connect(_on_library_toggled.bind(lib_name))
		lib_container.add_child(checkbox)
		
		# Individual download button
		var download_btn = Button.new()
		download_btn.text = "↓"
		download_btn.custom_minimum_size = Vector2(30, 0)
		download_btn.pressed.connect(_download_single_library.bind(lib_name))
		download_btn.disabled = not is_enabled
		lib_container.add_child(download_btn)
		
		# Status indicator
		var status_icon = Label.new()
		var local_path = "res://data/web/" + lib_config.get("filename", lib_name + ".js")
		if FileAccess.file_exists(local_path):
			status_icon.text = "✓"
			status_icon.add_theme_color_override("font_color", Color.GREEN)
		else:
			status_icon.text = "○"
			status_icon.add_theme_color_override("font_color", Color.GRAY)
		lib_container.add_child(status_icon)

func _on_library_toggled(lib_name: String, enabled: bool):
	if config_data.has(lib_name):
		config_data[lib_name]["enabled"] = enabled
		_save_config()
		_update_library_list()

func _save_config():
	var file = FileAccess.open(CONFIG_PATH, FileAccess.WRITE)
	if not file:
		_update_status("Error: Could not save cdn_config.json")
		return
	
	var json_string = JSON.stringify(config_data, "\t")
	file.store_string(json_string)
	file.close()

func _refresh_config():
	_load_config()
	_update_library_list()

func _download_all_libraries():
	var enabled_count = 0
	for lib_name in config_data:
		var lib_config = config_data[lib_name]
		if lib_config.get("enabled", false):
			enabled_count += 1
	
	if enabled_count == 0:
		_update_status("No libraries enabled for download")
		return
	
	pending_downloads = enabled_count
	download_button.disabled = true
	_update_status("Downloading " + str(enabled_count) + " libraries...")
	
	for lib_name in config_data:
		var lib_config = config_data[lib_name]
		if lib_config.get("enabled", false):
			_download_library(lib_name, lib_config)

func _download_single_library(lib_name: String):
	if not config_data.has(lib_name):
		return
	
	var lib_config = config_data[lib_name]
	pending_downloads = 1
	download_button.disabled = true
	_update_status("Downloading " + lib_name + "...")
	_download_library(lib_name, lib_config)

func _download_library(lib_name: String, lib_config: Dictionary):
	var cdn_url = lib_config.get("cdn_url", "")
	var filename = lib_config.get("filename", lib_name + ".js")
	
	var http = HTTPRequest.new()
	add_child(http)
	http_requests.append(http)
	
	# Configure HTTPS/TLS settings
	http.set_tls_options(TLSOptions.client())
	
	# Connect signal properly - HTTPRequest signal passes (result, response_code, headers, body)
	# We need to bind our custom parameters at the end
	http.request_completed.connect(_on_download_completed.bind(lib_name, filename))
	
	var err = http.request(cdn_url)
	if err != OK:
		_update_status("Error: Failed to start download for " + lib_name)
		http.queue_free()
		http_requests.erase(http)
		pending_downloads -= 1
		_check_downloads_complete()

func _on_download_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray, lib_name: String, filename: String):
	# Find and clean up the corresponding HTTP request
	for i in range(http_requests.size() - 1, -1, -1):
		var http = http_requests[i]
		if not is_instance_valid(http):
			http_requests.remove_at(i)
		elif http.get_http_client_status() == HTTPClient.STATUS_DISCONNECTED:
			http.queue_free()
			http_requests.remove_at(i)
			break
	
	pending_downloads -= 1
	
	if response_code == 200:
		# Ensure directory exists
		var dir = DirAccess.open("res://")
		if not dir.dir_exists("data/web"):
			dir.make_dir_recursive("data/web")
		
		var local_path = "res://data/web/" + filename
		var file = FileAccess.open(local_path, FileAccess.WRITE)
		if file:
			file.store_buffer(body)
			file.close()
			_update_status("Downloaded " + lib_name + " (" + str(body.size()) + " bytes)")
		else:
			_update_status("Error: Could not save " + lib_name)
	else:
		_update_status("Error: Download failed for " + lib_name + " (HTTP " + str(response_code) + ")")
	
	_check_downloads_complete()

func _check_downloads_complete():
	if pending_downloads <= 0:
		download_button.disabled = false
		_update_status("Downloads complete!")
		_update_library_list()  # Refresh status indicators

func _update_status(message: String):
	status_label.text = message
	print("Web CDN Integrator: " + message)

func _generate_shell_html():
	_update_status("Generating shell.html from template...")
	
	var template_path = "res://data/template/template.html"
	var shell_path = "res://data/template/shell.html"
	
	# Read template
	var template_file = FileAccess.open(template_path, FileAccess.READ)
	if not template_file:
		_update_status("Error: Could not read template.html")
		return
	
	var content = template_file.get_as_text()
	template_file.close()
	
	# Process all enabled libraries
	var replacements_made = 0
	for lib_name in config_data:
		var lib_config = config_data[lib_name]
		if lib_config.get("enabled", false):
			var template_tag = lib_config.get("template_tag", "$" + lib_name.to_upper())
			var filename = lib_config.get("filename", lib_name + ".js")
			var init_script = lib_config.get("init_script", "")
			
			if template_tag in content:
				var js_path = "res://data/web/" + filename
				var js_file = FileAccess.open(js_path, FileAccess.READ)
				if js_file:
					var js_code = js_file.get_as_text()
					js_file.close()
					
					# Create replacement with version info, init script, and the library code
					var header = "// " + lib_name.capitalize() + " - Generated by Web CDN Integrator\nconsole.log('" + lib_name.capitalize() + " loaded (inlined)');"
					var replacement = '<script>\n' + header
					
					if init_script != "":
						replacement += '\n' + init_script
					
					replacement += '\n' + js_code + '\n</script>'
					
					content = content.replace(template_tag, replacement)
					replacements_made += 1
					_update_status("Inlined " + lib_name + " into shell.html")
				else:
					_update_status("Warning: " + js_path + " not found, skipping " + lib_name)
	
	# Write shell.html
	var shell_file = FileAccess.open(shell_path, FileAccess.WRITE)
	if shell_file:
		shell_file.store_string(content)
		shell_file.close()
		_update_status("Generated shell.html with " + str(replacements_made) + " libraries inlined")
	else:
		_update_status("Error: Could not write shell.html")