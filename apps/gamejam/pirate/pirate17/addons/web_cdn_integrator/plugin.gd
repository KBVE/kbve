@tool
extends EditorPlugin

var export_plugin
var dock

func _enter_tree():
	export_plugin = WebCDNExportPlugin.new()
	add_export_plugin(export_plugin)
	
	# Add dock only if not in headless mode
	if not OS.has_feature("headless"):
		dock = preload("res://addons/web_cdn_integrator/web_cdn_dock.gd").new()
		add_control_to_dock(DOCK_SLOT_LEFT_UL, dock)
	
	print("Web CDN Integrator plugin loaded (headless: ", OS.has_feature("headless"), ")")

func _exit_tree():
	remove_export_plugin(export_plugin)
	export_plugin = null
	
	# Remove dock
	if dock:
		remove_control_from_docks(dock)
		dock = null

class WebCDNExportPlugin extends EditorExportPlugin:
	const CONFIG_PATH = "res://addons/web_cdn_integrator/cdn_config.json"
	var config_data = {}
	
	func _get_name() -> String:
		return "WebCDNIntegrator"
	
	var processed_template_content = ""
	
	func _export_begin(features: PackedStringArray, is_debug: bool, path: String, flags: int):
		if "web" in features:
			print("Web CDN Integrator: Starting web export with JS inlining")
			_load_config()
			
			# Load and process the template content in memory
			var template_path = "res://data/template/shell.html"
			if FileAccess.file_exists(template_path):
				print("CDN Integrator: Loading template for processing")
				var file = FileAccess.open(template_path, FileAccess.READ)
				if file:
					processed_template_content = file.get_as_text()
					file.close()
					
					# Process the content in memory
					for lib_name in config_data:
						var lib_config = config_data[lib_name]
						if lib_config.get("enabled", false):
							processed_template_content = _process_library_replacement(processed_template_content, lib_name, lib_config)
					
					print("CDN Integrator: Template processed in memory")
	
	func _export_file(path: String, type: String, features: PackedStringArray):
		if not "web" in features:
			return
		
		# In headless mode, we need to be more aggressive about finding the template
		var is_template = false
		
		# Check various conditions for template files
		if path == "res://data/template/shell.html":
			is_template = true
		elif path.ends_with("shell.html"):
			is_template = true
		elif path.ends_with(".html") and path.contains("template"):
			is_template = true
		
		if is_template:
			print("CDN Integrator: Intercepting template: ", path)
			
			# Use our pre-processed content if available
			if processed_template_content != "":
				print("CDN Integrator: Using pre-processed template content")
				skip()
				add_file(path, processed_template_content.to_utf8_buffer(), false)
				print("CDN Integrator: Pre-processed template added to export")
			else:
				# Fallback to processing on the fly
				var file = FileAccess.open(path, FileAccess.READ)
				if not file:
					push_warning("CDN Integrator: Could not read template file: " + path)
					return
				
				var content = file.get_as_text()
				file.close()
				
				if "$SUPABASE" in content:
					print("CDN Integrator: Found $SUPABASE placeholder, processing...")
					
					# Process all enabled libraries from config
					for lib_name in config_data:
						var lib_config = config_data[lib_name]
						if lib_config.get("enabled", false):
							print("CDN Integrator: Processing library: ", lib_name)
							content = _process_library_replacement(content, lib_name, lib_config)
					
					skip()
					add_file(path, content.to_utf8_buffer(), false)
					print("CDN Integrator: Template processed and added to export")
	
	func _load_config():
		var file = FileAccess.open(CONFIG_PATH, FileAccess.READ)
		if not file:
			push_warning("Could not open cdn_config.json")
			return
		
		var json_string = file.get_as_text()
		file.close()
		
		var json = JSON.new()
		var parse_result = json.parse(json_string)
		if parse_result != OK:
			push_warning("Failed to parse cdn_config.json")
			return
		
		config_data = json.data
		print("Loaded CDN configuration for: ", config_data.keys())
	
	func _process_library_replacement(content: String, lib_name: String, lib_config: Dictionary) -> String:
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
				var header = "// " + lib_name.capitalize() + " - Inlined by Web CDN Integrator\nconsole.log('" + lib_name.capitalize() + " loaded (inlined)');"
				var replacement = '<script>\n' + header
				
				if init_script != "":
					replacement += '\n' + init_script
				
				replacement += '\n' + js_code + '\n</script>'
				
				content = content.replace(template_tag, replacement)
				print("Inlined ", lib_name, " into shell.html (", js_code.length(), " chars)")
			else:
				print("Could not load ", js_path, " - keeping ", template_tag, " placeholder")
				print("Run the CDN downloader script first: Script > cdn_downloader.gd > Run")
		
		return content
	
	func _export_end():
		print("Web CDN Integrator: Post-processing HTML file...")
		# Give export time to complete
		call_deferred("_post_process_html")
	
	func _post_process_html():
		# Try common HTML file locations
		var html_paths = [
			"test/pirate17.html",
			"build/web/index.html",
			"build/pirate17.html", 
			"export/pirate17.html",
			"pirate17.html"
		]
		
		for html_path in html_paths:
			if FileAccess.file_exists(html_path):
				print("Found HTML file at: ", html_path)
				_process_html_file(html_path)
				return
		
		print("Web CDN Integrator: No HTML file found to process")
	
	func _process_html_file(html_path: String):
		var file = FileAccess.open(html_path, FileAccess.READ)
		if not file:
			print("Could not read HTML file: ", html_path)
			return
		
		var content = file.get_as_text()
		file.close()
		
		print("HTML file size: ", content.length())
		print("Contains $SUPABASE: ", "$SUPABASE" in content)
		
		var modified = false
		
		# Process all enabled libraries from config
		for lib_name in config_data:
			var lib_config = config_data[lib_name]
			if lib_config.get("enabled", false):
				var old_content = content
				content = _process_library_replacement(content, lib_name, lib_config)
				if content != old_content:
					modified = true
		
		if modified:
			# Write back the modified content
			file = FileAccess.open(html_path, FileAccess.WRITE)
			if file:
				file.store_string(content)
				file.close()
				print("Successfully updated HTML file with inlined JS")
			else:
				print("Could not write to HTML file")
		else:
			print("No modifications made to HTML file")
		
		print("Web CDN Integrator: Export completed")