@tool
extends Control

# URLs and paths
const ITEMDB_URL = "https://kbve.com/api/itemdb.json"
const BASE_IMAGE_URL = "https://kbve.com"
const LOCAL_ASSETS_PATH = "res://assets/items/"
const LOCAL_JSON_PATH = "res://data/itemdb.json"

# UI elements
var download_button: Button
var progress_label: Label
var progress_bar: ProgressBar
var log_text: TextEdit

# Download tracking
var download_queue: Array[Dictionary] = []
var current_downloads: int = 0
var max_concurrent_downloads: int = 3
var total_files: int = 0
var completed_files: int = 0
var is_downloading: bool = false
var json_http_request: HTTPRequest

func _init():
	name = "ItemDB Downloader"
	setup_ui()

func setup_ui():
	set_custom_minimum_size(Vector2(250, 400))
	
	var vbox = VBoxContainer.new()
	add_child(vbox)
	
	# Title
	var title = Label.new()
	title.text = "ItemDB Asset Downloader"
	title.add_theme_font_size_override("font_size", 14)
	vbox.add_child(title)
	
	vbox.add_child(HSeparator.new())
	
	# Download button
	download_button = Button.new()
	download_button.text = "Download ItemDB & Images"
	download_button.pressed.connect(_on_download_pressed)
	vbox.add_child(download_button)
	
	# Progress label
	progress_label = Label.new()
	progress_label.text = "Ready to download"
	vbox.add_child(progress_label)
	
	# Progress bar
	progress_bar = ProgressBar.new()
	progress_bar.value = 0
	progress_bar.max_value = 100
	vbox.add_child(progress_bar)
	
	vbox.add_child(HSeparator.new())
	
	# Log
	var log_label = Label.new()
	log_label.text = "Download Log:"
	vbox.add_child(log_label)
	
	log_text = TextEdit.new()
	log_text.editable = false
	log_text.placeholder_text = "Download logs will appear here..."
	log_text.custom_minimum_size = Vector2(200, 200)
	vbox.add_child(log_text)
	
	# Clear log button
	var clear_button = Button.new()
	clear_button.text = "Clear Log"
	clear_button.pressed.connect(_on_clear_log)
	vbox.add_child(clear_button)

func _on_download_pressed():
	if is_downloading:
		log_message("Download already in progress...")
		return
	
	is_downloading = true
	download_button.disabled = true
	progress_bar.value = 0
	completed_files = 0
	total_files = 0
	
	log_message("=== ItemDB Asset Downloader ===")
	log_message("Starting download process...")
	
	# Create directories
	ensure_directories_exist()
	
	# Download the JSON first
	download_json_file()

func _on_clear_log():
	log_text.text = ""

func log_message(message: String):
	print(message)
	log_text.text += message + "\n"
	# Scroll to bottom
	call_deferred("_scroll_to_bottom")

func _scroll_to_bottom():
	if log_text.get_line_count() > 0:
		log_text.scroll_vertical = log_text.get_line_count()

func ensure_directories_exist():
	var dir = DirAccess.open("res://")
	
	# Create data directory for JSON
	if not dir.dir_exists("data"):
		dir.make_dir("data")
		log_message("Created data directory")
	
	# Create assets/items directory
	if not dir.dir_exists("assets"):
		dir.make_dir("assets")
	if not dir.dir_exists("assets/items"):
		dir.make_dir("assets/items")
		log_message("Created assets/items directory")

func download_json_file():
	log_message("Downloading itemdb.json...")
	progress_label.text = "Downloading JSON..."
	
	json_http_request = HTTPRequest.new()
	add_child(json_http_request)
	
	json_http_request.request_completed.connect(_on_json_downloaded)
	
	var error = json_http_request.request(ITEMDB_URL)
	if error != OK:
		log_message("Failed to start JSON download: " + str(error))
		reset_download_state()

func _on_json_downloaded(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
	if response_code == 200:
		log_message("JSON downloaded successfully")
		
		# Save JSON file locally
		var file = FileAccess.open(LOCAL_JSON_PATH, FileAccess.WRITE)
		if file:
			file.store_string(body.get_string_from_utf8())
			file.close()
			log_message("Saved itemdb.json to: " + LOCAL_JSON_PATH)
			
			# Parse JSON and start image downloads
			parse_and_download_images(body.get_string_from_utf8())
		else:
			log_message("Failed to save JSON file")
			reset_download_state()
	else:
		log_message("Failed to download JSON. Response code: " + str(response_code))
		reset_download_state()
	
	if json_http_request:
		json_http_request.queue_free()
		json_http_request = null

func parse_and_download_images(json_string: String):
	log_message("Parsing JSON and preparing image downloads...")
	progress_label.text = "Parsing JSON..."
	
	var json = JSON.new()
	var parse_result = json.parse(json_string)
	
	if parse_result != OK:
		log_message("Failed to parse JSON")
		reset_download_state()
		return
	
	var data = json.data
	if not data is Dictionary:
		log_message("JSON is not a dictionary")
		reset_download_state()
		return
	
	# Extract all image paths
	var image_paths: Array[String] = []
	
	for item_key in data:
		var item_data = data[item_key]
		if item_data is Dictionary and item_data.has("image"):
			var image_path = item_data["image"]
			if image_path is String and not image_path.is_empty():
				image_paths.append(image_path)
	
	log_message("Found " + str(image_paths.size()) + " images to download")
	
	# Prepare download queue
	total_files = image_paths.size()
	progress_bar.max_value = total_files
	
	for image_path in image_paths:
		var download_info = {
			"url": BASE_IMAGE_URL + image_path,
			"local_path": LOCAL_ASSETS_PATH + image_path.trim_prefix("/"),
			"relative_path": image_path
		}
		download_queue.append(download_info)
	
	# Start downloading images
	start_image_downloads()

func start_image_downloads():
	log_message("Starting image downloads...")
	progress_label.text = "Downloading images..."
	
	# Start initial batch of downloads
	while current_downloads < max_concurrent_downloads and download_queue.size() > 0:
		start_next_download()

func start_next_download():
	if download_queue.is_empty():
		return
	
	var download_info = download_queue.pop_front()
	current_downloads += 1
	
	# Create directory for the image if it doesn't exist
	var local_dir = download_info["local_path"].get_base_dir()
	ensure_directory_path(local_dir)
	
	var http_request = HTTPRequest.new()
	add_child(http_request)
	
	# Use a lambda to capture the download_info and http_request
	http_request.request_completed.connect(func(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
		_on_image_downloaded_with_info(download_info, http_request, result, response_code, headers, body)
	)
	
	var error = http_request.request(download_info["url"])
	if error != OK:
		log_message("Failed to start download for: " + download_info["url"])
		http_request.queue_free()
		current_downloads -= 1
		# Try next download
		if download_queue.size() > 0:
			start_next_download()

func _on_image_downloaded_with_info(download_info: Dictionary, http_request: HTTPRequest, result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
	current_downloads -= 1
	completed_files += 1
	
	if response_code == 200:
		# Save the image file
		var file = FileAccess.open(download_info["local_path"], FileAccess.WRITE)
		if file:
			file.store_buffer(body)
			file.close()
			log_message("Downloaded [" + str(completed_files) + "/" + str(total_files) + "]: " + download_info["relative_path"])
		else:
			log_message("Failed to save: " + download_info["local_path"])
	else:
		log_message("Failed to download [" + str(completed_files) + "/" + str(total_files) + "]: " + download_info["url"] + " (" + str(response_code) + ")")
	
	# Update progress
	progress_bar.value = completed_files
	progress_label.text = "Downloaded " + str(completed_files) + "/" + str(total_files) + " images"
	
	http_request.queue_free()
	
	# Start next download if queue not empty
	if download_queue.size() > 0:
		start_next_download()
	elif current_downloads == 0:
		# All downloads completed
		download_complete()

func download_complete():
	log_message("=== Download Complete ===")
	log_message("Total files processed: " + str(completed_files) + "/" + str(total_files))
	log_message("JSON saved to: " + LOCAL_JSON_PATH)
	log_message("Images saved to: " + LOCAL_ASSETS_PATH)
	log_message("Refreshing filesystem...")
	
	progress_label.text = "Download complete! Refreshing filesystem..."
	
	# Refresh the filesystem
	EditorInterface.get_resource_filesystem().scan()
	
	reset_download_state()
	
	log_message("Done! Check the FileSystem dock for new assets.")

func reset_download_state():
	is_downloading = false
	download_button.disabled = false
	current_downloads = 0
	download_queue.clear()

func ensure_directory_path(dir_path: String):
	var parts = dir_path.split("/")
	var current_path = "res://"
	
	var dir = DirAccess.open("res://")
	
	for part in parts:
		if part.is_empty() or part == "res:":
			continue
		
		current_path += part + "/"
		
		if not dir.dir_exists(current_path):
			dir.make_dir(current_path)