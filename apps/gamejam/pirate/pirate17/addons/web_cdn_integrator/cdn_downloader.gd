@tool
extends EditorScript

const CONFIG_PATH = "res://addons/web_cdn_integrator/cdn_config.json"
var config_data = {}
var pending_downloads = 0
var http_requests = []

func _run():
	print("Loading CDN configuration...")
	_load_config()
	
	# Download all enabled CDN files
	for lib_name in config_data:
		var lib_config = config_data[lib_name]
		if lib_config.get("enabled", false):
			pending_downloads += 1
			_download_library(lib_name, lib_config)

func _load_config():
	var file = FileAccess.open(CONFIG_PATH, FileAccess.READ)
	if not file:
		push_error("Could not open cdn_config.json")
		return
	
	var json_string = file.get_as_text()
	file.close()
	
	var json = JSON.new()
	var parse_result = json.parse(json_string)
	if parse_result != OK:
		push_error("Failed to parse cdn_config.json")
		return
	
	config_data = json.data
	print("Loaded configuration for: ", config_data.keys())

func _download_library(lib_name: String, lib_config: Dictionary):
	var cdn_url = lib_config.get("cdn_url", "")
	var filename = lib_config.get("filename", lib_name + ".js")
	
	print("Downloading ", lib_name, " from CDN...")
	print("URL: ", cdn_url)
	
	var http = HTTPRequest.new()
	EditorInterface.get_editor_main_screen().add_child(http)
	http_requests.append(http)
	
	http.request_completed.connect(_on_request_completed.bind(http, lib_name, filename))
	var err = http.request(cdn_url)
	if err != OK:
		push_error("Failed to start CDN request for " + lib_name + ": " + str(err))
		pending_downloads -= 1

func _on_request_completed(http: HTTPRequest, lib_name: String, filename: String, result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
	http.queue_free()
	http_requests.erase(http)
	pending_downloads -= 1
	
	if response_code != 200:
		push_error("Failed to download " + lib_name + ": HTTP " + str(response_code))
		return
	
	# Ensure directory exists
	var dir = DirAccess.open("res://")
	if not dir.dir_exists("data/web"):
		dir.make_dir_recursive("data/web")
		print("Created data/web directory")
	
	var local_path = "res://data/web/" + filename
	var file = FileAccess.open(local_path, FileAccess.WRITE)
	if file:
		file.store_buffer(body)
		file.close()
		print("Saved ", lib_name, " to ", local_path, " (", body.size(), " bytes)")
	else:
		push_error("Could not write to: " + local_path)
	
	if pending_downloads == 0:
		print("All CDN files downloaded! Run a web export to inline them.")
		# Clean up any remaining HTTP requests
		for req in http_requests:
			if is_instance_valid(req):
				req.queue_free()
		http_requests.clear()