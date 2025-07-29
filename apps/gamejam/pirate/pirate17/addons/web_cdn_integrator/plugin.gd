@tool
extends EditorPlugin

var export_plugin

func _enter_tree():
	export_plugin = WebCDNExportPlugin.new()
	add_export_plugin(export_plugin)
	print("Web CDN Integrator plugin loaded")

func _exit_tree():
	remove_export_plugin(export_plugin)
	export_plugin = null

class WebCDNExportPlugin extends EditorExportPlugin:
	const CONFIG_PATH = "res://addons/web_cdn_integrator/cdn_config.json"
	var config_data = {}
	
	func _get_name() -> String:
		return "WebCDNIntegrator"
	
	func _export_begin(features: PackedStringArray, is_debug: bool, path: String, flags: int):
		if "web" in features:
			print("Web CDN Integrator: Starting web export with JS inlining")
			_load_config()
	
	func _export_file(path: String, type: String, features: PackedStringArray):
		if not "web" in features:
			return
		
		if path == "res://data/template/shell.html":
			print("Processing shell.html template")
			var file = FileAccess.open(path, FileAccess.READ)
			if not file:
				push_warning("Could not read shell.html template")
				return
			
			var content = file.get_as_text()
			file.close()
			
			# Process all enabled libraries from config
			for lib_name in config_data:
				var lib_config = config_data[lib_name]
				if lib_config.get("enabled", false):
					content = _process_library_replacement(content, lib_name, lib_config)
			
			skip()
			add_file(path, content.to_utf8_buffer(), false)
	
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
		print("Web CDN Integrator: Export completed")