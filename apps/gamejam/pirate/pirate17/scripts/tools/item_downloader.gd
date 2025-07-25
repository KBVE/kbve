@tool
extends EditorScript

const ITEMDB_URL = "https://kbve.com/api/itemdb.json"
const BASE_IMAGE_URL = "https://kbve.com"
const LOCAL_ASSETS_PATH = "res://assets/items/"
const LOCAL_JSON_PATH = "res://data/itemdb.json"

var download_queue: Array[Dictionary] = []
var current_downloads: int = 0
var max_concurrent_downloads: int = 5
var total_files: int = 0
var completed_files: int = 0

func _run():
	print("=== ItemDB Asset Downloader ===")
	print("Starting download process...")
	
	ensure_directories_exist()
	
	download_json_file()

func ensure_directories_exist():
	var dir = DirAccess.open("res://")
	
	if not dir.dir_exists("data"):
		dir.make_dir("data")
		print("Created data directory")
	
	if not dir.dir_exists("assets"):
		dir.make_dir("assets")
	if not dir.dir_exists("assets/items"):
		dir.make_dir("assets/items")
		print("Created assets/items directory")

func download_json_file():
	print("Downloading itemdb.json...")
	
	var http_request = HTTPRequest.new()
	EditorInterface.get_editor_main_screen().add_child(http_request)
	
	http_request.request_completed.connect(_on_json_downloaded)
	
	var error = http_request.request(ITEMDB_URL)
	if error != OK:
		print("Failed to start JSON download: ", error)
		http_request.queue_free()

func _on_json_downloaded(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
	var http_request = get_sender_from_signal()
	
	if response_code == 200:
		print("JSON downloaded successfully")
		
		var file = FileAccess.open(LOCAL_JSON_PATH, FileAccess.WRITE)
		if file:
			file.store_string(body.get_string_from_utf8())
			file.close()
			print("Saved itemdb.json to: ", LOCAL_JSON_PATH)
			
			parse_and_download_images(body.get_string_from_utf8())
		else:
			print("Failed to save JSON file")
	else:
		print("Failed to download JSON. Response code: ", response_code)
	
	http_request.queue_free()

func parse_and_download_images(json_string: String):
	print("Parsing JSON and preparing image downloads...")
	
	var json = JSON.new()
	var parse_result = json.parse(json_string)
	
	if parse_result != OK:
		print("Failed to parse JSON")
		return
	
	var data = json.data
	if not data is Dictionary:
		print("JSON is not a dictionary")
		return
	
	var image_paths: Array[String] = []
	
	for item_key in data:
		var item_data = data[item_key]
		if item_data is Dictionary and item_data.has("image"):
			var image_path = item_data["image"]
			if image_path is String and not image_path.is_empty():
				image_paths.append(image_path)
	
	print("Found ", image_paths.size(), " images to download")
	
	total_files = image_paths.size()
	completed_files = 0
	
	for image_path in image_paths:
		var download_info = {
			"url": BASE_IMAGE_URL + image_path,
			"local_path": LOCAL_ASSETS_PATH + image_path.trim_prefix("/"),
			"relative_path": image_path
		}
		download_queue.append(download_info)
	
	start_image_downloads()

func start_image_downloads():
	print("Starting image downloads...")
	print("Queue size: ", download_queue.size())
	
	while current_downloads < max_concurrent_downloads and download_queue.size() > 0:
		start_next_download()

func start_next_download():
	if download_queue.is_empty():
		return
	
	var download_info = download_queue.pop_front()
	current_downloads += 1
	
	var local_dir = download_info["local_path"].get_base_dir()
	ensure_directory_path(local_dir)
	
	var http_request = HTTPRequest.new()
	EditorInterface.get_editor_main_screen().add_child(http_request)
	
	http_request.request_completed.connect(_on_image_downloaded.bind(download_info, http_request))
	
	var error = http_request.request(download_info["url"])
	if error != OK:
		print("Failed to start download for: ", download_info["url"])
		http_request.queue_free()
		current_downloads -= 1
		if download_queue.size() > 0:
			start_next_download()

func _on_image_downloaded(download_info: Dictionary, http_request: HTTPRequest, result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray):
	current_downloads -= 1
	completed_files += 1
	
	if response_code == 200:
		var file = FileAccess.open(download_info["local_path"], FileAccess.WRITE)
		if file:
			file.store_buffer(body)
			file.close()
			print("Downloaded [", completed_files, "/", total_files, "]: ", download_info["relative_path"])
		else:
			print("Failed to save: ", download_info["local_path"])
	else:
		print("Failed to download [", completed_files, "/", total_files, "]: ", download_info["url"], " (", response_code, ")")
	
	http_request.queue_free()
	
	if download_queue.size() > 0:
		start_next_download()
	elif current_downloads == 0:
		download_complete()

func download_complete():
	print("=== Download Complete ===")
	print("Total files processed: ", completed_files, "/", total_files)
	print("JSON saved to: ", LOCAL_JSON_PATH)
	print("Images saved to: ", LOCAL_ASSETS_PATH)
	print("You can now refresh the FileSystem dock to see the new assets")
	
	EditorInterface.get_resource_filesystem().scan()

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

func get_sender_from_signal() -> HTTPRequest:
	var children = EditorInterface.get_editor_main_screen().get_children()
	for child in children:
		if child is HTTPRequest:
			return child
	return null